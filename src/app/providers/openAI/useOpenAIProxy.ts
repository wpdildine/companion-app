/**
 * Thin transport-only hook for the OpenAI proxy. Owns only request lifecycle and
 * proxy communication for /api/stt and /api/respond. Does not own RAG, context
 * generation, transcript parsing, or orchestration. Model selection is not exposed;
 * the Worker hardcodes/whitelists model choice.
 */

import { useCallback, useState } from 'react';
import { getEndpointBaseUrl } from '../../endpointConfig';
import type {
  OpenAIProxyError,
  RespondParams,
  RespondResult,
  RespondUsage,
  TranscribeAudioParams,
  TranscribeAudioResult,
} from './openAIProxyTypes';

const ERR_BASE_URL = 'OpenAI proxy base URL not configured (ENDPOINT_BASE_URL)';
const ERR_REQUEST_FAILED = 'OpenAI proxy request failed';
const ERR_STT_NO_TEXT = 'STT transcription returned no text';
const ERR_RESPOND_NO_TEXT = 'Respond request returned no assistant text';

function normalizeError(message: string, code?: string): OpenAIProxyError {
  return { message, code };
}

function isOpenAIProxyError(error: unknown): error is OpenAIProxyError {
  return (
    error != null &&
    typeof error === 'object' &&
    !(error instanceof Error) &&
    typeof (error as OpenAIProxyError).message === 'string'
  );
}

function throwNormalizedError(message: string, code?: string): never {
  throw normalizeError(message, code);
}

function buildProxyUrl(base: string, path: '/api/stt' | '/api/respond'): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

/** Extract text from proxy STT response (e.g. { text } or OpenAI Whisper shape). */
function parseSttResponse(data: unknown): { text: string } {
  if (data != null && typeof data === 'object' && 'text' in data) {
    const t = (data as { text?: unknown }).text;
    if (typeof t === 'string' && t.trim().length > 0) {
      return { text: t.trim() };
    }
  }
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
    try {
      const url = buildProxyUrl(base, '/api/stt');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: input.audioBase64,
          ...(input.mimeType != null && { mimeType: input.mimeType }),
          ...(input.filename != null && { filename: input.filename }),
          ...(input.language != null && { language: input.language }),
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
      const { text } = parseSttResponse(data);
      setLastError(null);
      const result: TranscribeAudioResult = { text, raw: data };
      return result;
    } catch (e) {
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
