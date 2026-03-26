/**
 * Thin transport-only hook for the OpenAI proxy. Owns only request lifecycle and
 * proxy communication for /api/stt and /api/respond. Does not own RAG, context
 * generation, transcript parsing, or orchestration. Model selection is not exposed;
 * the Worker hardcodes/whitelists model choice.
 */

import { useCallback, useState } from 'react';
import { getEndpointBaseUrl } from '../../../shared/config/endpointConfig';
import { logWarn } from '../../../shared/logging';
import {
  isOpenAIProxyError,
  type OpenAIProxyError,
  type RespondParams,
  type RespondResult,
  type RespondUsage,
  type TranscribeAudioParams,
  type TranscribeAudioResult,
} from './openAIProxyTypes';

const ERR_BASE_URL = 'OpenAI proxy base URL not configured (ENDPOINT_BASE_URL)';
const ERR_REQUEST_FAILED = 'OpenAI proxy request failed';
const ERR_STT_NO_TEXT = 'STT transcription returned no text';
const ERR_STT_TIMEOUT = 'STT request timed out';
const ERR_RESPOND_NO_TEXT = 'Respond request returned no assistant text';

/** Timeout for /api/stt fetch; short for hold-to-speak + local proxy. */
const REMOTE_STT_REQUEST_TIMEOUT_MS = 4000;

function normalizeError(message: string, code?: string): OpenAIProxyError {
  return { message, code };
}

function throwNormalizedError(message: string, code?: string): never {
  throw normalizeError(message, code);
}

function buildProxyUrl(base: string, path: '/api/stt' | '/api/respond'): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readStructuredText(value: unknown): string | null {
  const direct = readTrimmedString(value);
  if (direct) return direct;

  if (Array.isArray(value)) {
    const joined = value
      .map(item => {
        if (typeof item === 'string') return readTrimmedString(item);
        if (item != null && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          return (
            readTrimmedString(obj.text) ??
            readTrimmedString(obj.value) ??
            readTrimmedString(obj.content)
          );
        }
        return null;
      })
      .filter((item): item is string => item != null)
      .join(' ')
      .trim();
    return joined.length > 0 ? joined : null;
  }

  if (value != null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (
      readTrimmedString(obj.text) ??
      readTrimmedString(obj.value) ??
      readTrimmedString(obj.content) ??
      readStructuredText(obj.parts) ??
      readStructuredText(obj.segments)
    );
  }

  return null;
}

function summarizeObjectKeys(value: unknown): string[] {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).slice(0, 8);
}

function summarizeSttPayloadShape(data: unknown): Record<string, unknown> {
  if (data == null) return { responseType: 'null' };
  if (Array.isArray(data)) {
    return {
      responseType: 'array',
      length: data.length,
      firstItemKeys: summarizeObjectKeys(data[0]),
    };
  }
  if (typeof data !== 'object') {
    return {
      responseType: typeof data,
      preview: typeof data === 'string' ? data.slice(0, 120) : String(data),
    };
  }

  const obj = data as Record<string, unknown>;
  return {
    responseType: 'object',
    keys: Object.keys(obj).slice(0, 12),
    textType: Array.isArray(obj.text) ? 'array' : typeof obj.text,
    textKeys: summarizeObjectKeys(obj.text),
    textPreview: readStructuredText(obj.text)?.slice(0, 120) ?? null,
    dataKeys: summarizeObjectKeys(obj.data),
    resultKeys: summarizeObjectKeys(obj.result),
    responseKeys: summarizeObjectKeys(obj.response),
    firstChoiceKeys: Array.isArray(obj.choices) ? summarizeObjectKeys(obj.choices[0]) : [],
    segmentCount: Array.isArray(obj.segments) ? obj.segments.length : 0,
    hasError: obj.error != null,
  };
}

/** Extract text from proxy STT response (e.g. { text } or OpenAI Whisper shape). */
function parseSttResponse(data: unknown): { text: string } {
  if (data != null && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.text === 'string') {
      return { text: obj.text };
    }
    const directCandidates = [
      obj.transcript,
      obj.output_text,
      obj.text,
      (obj.data as Record<string, unknown> | undefined)?.text,
      (obj.data as Record<string, unknown> | undefined)?.transcript,
      (obj.result as Record<string, unknown> | undefined)?.text,
      (obj.result as Record<string, unknown> | undefined)?.transcript,
      (obj.response as Record<string, unknown> | undefined)?.text,
      (obj.response as Record<string, unknown> | undefined)?.transcript,
    ];
    for (const candidate of directCandidates) {
      const text = readStructuredText(candidate);
      if (text) {
        return { text };
      }
    }

    if (Array.isArray(obj.segments)) {
      const joinedSegments = obj.segments
        .map(segment => readTrimmedString((segment as Record<string, unknown> | null)?.text))
        .filter((segment): segment is string => segment != null)
        .join(' ')
        .trim();
      if (joinedSegments.length > 0) {
        return { text: joinedSegments };
      }
    }

    if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const firstChoice = obj.choices[0] as Record<string, unknown> | undefined;
      const text = readStructuredText(firstChoice?.text);
      if (text) {
        return { text };
      }
    }
  }
  logWarn('OpenAIProxy', 'stt response missing text', summarizeSttPayloadShape(data));
  throwNormalizedError(ERR_STT_NO_TEXT, 'E_NO_TEXT');
}

/** Extract text, model, usage from proxy respond response (e.g. OpenAI chat shape or normalized). */
function parseRespondResponse(data: unknown): { text: string; model?: string; usage?: RespondUsage } {
  if (data == null || typeof data !== 'object') {
    throwNormalizedError(ERR_RESPOND_NO_TEXT, 'E_NO_TEXT');
  }
  const obj = data as Record<string, unknown>;

  // Normalized shape: { text, model?, usage? }
  if ('text' in obj && typeof (obj as { text: unknown }).text === 'string') {
    const text = (obj as { text: string }).text.trim();
    if (text.length === 0) {
      throwNormalizedError(ERR_RESPOND_NO_TEXT, 'E_NO_TEXT');
    }
    const result: { text: string; model?: string; usage?: RespondUsage } = { text };
    if (typeof obj.model === 'string') result.model = obj.model;
    if (obj.usage != null && typeof obj.usage === 'object') {
      const u = obj.usage as Record<string, unknown>;
      result.usage = {};
      if (typeof u.inputTokens === 'number') result.usage.inputTokens = u.inputTokens;
      if (typeof u.outputTokens === 'number') result.usage.outputTokens = u.outputTokens;
      if (typeof u.totalTokens === 'number') result.usage.totalTokens = u.totalTokens;
    }
    return result;
  }

  // OpenAI chat.completions shape: choices[0].message.content
  if ('choices' in obj && Array.isArray(obj.choices) && obj.choices.length > 0) {
    const first = obj.choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as { content?: unknown } | undefined;
    const content = message?.content;
    if (typeof content === 'string' && content.trim().length > 0) {
      const text = content.trim();
      const result: { text: string; model?: string; usage?: RespondUsage } = { text };
      if (typeof obj.model === 'string') result.model = obj.model;
      if (obj.usage != null && typeof obj.usage === 'object') {
        const u = obj.usage as Record<string, unknown>;
        result.usage = {};
        if (typeof u.prompt_tokens === 'number') result.usage.inputTokens = u.prompt_tokens;
        if (typeof u.completion_tokens === 'number') result.usage.outputTokens = u.completion_tokens;
        if (typeof u.total_tokens === 'number') result.usage.totalTokens = u.total_tokens;
      }
      return result;
    }
  }

  throwNormalizedError(ERR_RESPOND_NO_TEXT, 'E_NO_TEXT');
}

export function useOpenAIProxy(): {
  isTranscribing: boolean;
  isResponding: boolean;
  lastError: OpenAIProxyError | null;
  transcribeAudio: (input: TranscribeAudioParams) => Promise<TranscribeAudioResult>;
  respond: (input: RespondParams) => Promise<RespondResult>;
} {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [lastError, setLastError] = useState<OpenAIProxyError | null>(null);

  const transcribeAudio = useCallback(async (input: TranscribeAudioParams): Promise<TranscribeAudioResult> => {
    const base = getEndpointBaseUrl();
    if (base == null || base === '') {
      const error = normalizeError(ERR_BASE_URL, 'E_BASE_URL');
      setLastError(error);
      throw error;
    }
    setLastError(null);
    setIsTranscribing(true);
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const url = buildProxyUrl(base, '/api/stt');
      const fetchPromise = fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: input.audioBase64,
          ...(input.mimeType != null && { mimeType: input.mimeType }),
          ...(input.filename != null && { filename: input.filename }),
          ...(input.language != null && { language: input.language }),
        }),
        signal: controller.signal,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(normalizeError(ERR_STT_TIMEOUT, 'E_TIMEOUT'));
        }, REMOTE_STT_REQUEST_TIMEOUT_MS);
      });
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
      if (!res.ok) {
        throwNormalizedError(`${ERR_REQUEST_FAILED}: ${res.status}`, 'E_PROXY');
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throwNormalizedError(ERR_REQUEST_FAILED, 'E_JSON');
      }
      const { text } = parseSttResponse(data);
      setLastError(null);
      const result: TranscribeAudioResult = { text, raw: data };
      return result;
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      if (
        (e instanceof Error && e.name === 'AbortError') ||
        (isOpenAIProxyError(e) && e.code === 'E_TIMEOUT')
      ) {
        logWarn('OpenAIProxy', 'stt request timeout fired', {
          timeoutMs: REMOTE_STT_REQUEST_TIMEOUT_MS,
        });
        const error = normalizeError(ERR_STT_TIMEOUT, 'E_TIMEOUT');
        setLastError(error);
        throw error;
      }
      const error = isOpenAIProxyError(e) ? e : normalizeError(ERR_REQUEST_FAILED, 'E_NETWORK');
      setLastError(error);
      throw error;
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const respond = useCallback(async (input: RespondParams): Promise<RespondResult> => {
    const base = getEndpointBaseUrl();
    if (base == null || base === '') {
      const error = normalizeError(ERR_BASE_URL, 'E_BASE_URL');
      setLastError(error);
      throw error;
    }
    setLastError(null);
    setIsResponding(true);
    try {
      const url = buildProxyUrl(base, '/api/respond');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: input.prompt,
          ...(input.system != null && { system: input.system }),
        }),
      });
      if (!res.ok) {
        throwNormalizedError(`${ERR_REQUEST_FAILED}: ${res.status}`, 'E_PROXY');
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throwNormalizedError(ERR_REQUEST_FAILED, 'E_JSON');
      }
      const parsed = parseRespondResponse(data);
      setLastError(null);
      const result: RespondResult = {
        text: parsed.text,
        ...(parsed.model != null && { model: parsed.model }),
        ...(parsed.usage != null && { usage: parsed.usage }),
        raw: data,
      };
      return result;
    } catch (e) {
      const error = isOpenAIProxyError(e) ? e : normalizeError(ERR_REQUEST_FAILED, 'E_NETWORK');
      setLastError(error);
      throw error;
    } finally {
      setIsResponding(false);
    }
  }, []);

  return {
    isTranscribing,
    isResponding,
    lastError,
    transcribeAudio,
    respond,
  };
}
