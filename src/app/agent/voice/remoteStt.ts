/**
 * Remote STT coordinator: wait for captured audio, transcribe via proxy, normalize and apply transcript or call failure handler.
 * Does not own lifecycle/mode; orchestrator provides callbacks for apply and onFailure.
 */

import { logError, logInfo, logWarn } from '../../../shared/logging';
import { isOpenAIProxyError } from '../../providers/openAI/openAIProxyTypes';
import type { CapturedSttAudio } from '../../hooks/useSttAudioCapture';
import { normalizeTranscript, transcriptPreview } from './transcriptSettlement';

export const REMOTE_STT_CAPTURE_WAIT_MS = 800;
export const REMOTE_STT_CAPTURE_POLL_MS = 25;

export type TranscribeAudioFn = (input: {
  audioBase64: string;
  mimeType?: string;
  filename?: string;
  language?: string;
}) => Promise<{ text: string }>;

export interface RemoteSttDeps {
  getPendingCapture: () => CapturedSttAudio | null;
  clearPendingCapture: () => void;
  applyTranscript: (normalizedText: string) => void;
  transcribeAudio: TranscribeAudioFn;
  getEndpointBaseUrl: () => string | null;
  onFailure: (
    message: string,
    recordingSessionId?: string,
    meta?: { code?: string },
  ) => void;
  /** When STT returns empty/whitespace-only (recoverable). Orchestrator uses this to return to idle without terminal error. */
  onEmptyTranscript?: (recordingSessionId?: string) => void;
}

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * Returns a coordinator that exposes transcribeCapturedAudioIfNeeded.
 * Orchestrator keeps pendingCapturedAudioRef and passes get/clear; coordinator owns wait loop and transcribe flow.
 */
export function createRemoteSttCoordinator(deps: RemoteSttDeps): {
  transcribeCapturedAudioIfNeeded: (
    recordingSessionId?: string,
  ) => Promise<boolean>;
} {
  const {
    getPendingCapture,
    clearPendingCapture,
    applyTranscript,
    transcribeAudio,
    getEndpointBaseUrl,
    onFailure,
    onEmptyTranscript,
  } = deps;

  const transcribeCapturedAudioIfNeeded = async (
    recordingSessionId?: string,
  ): Promise<boolean> => {
    if (!getPendingCapture()) {
      logInfo(
        'AgentOrchestrator',
        'waiting for remote stt capture to finalize',
        {
          recordingSessionId,
          waitMs: REMOTE_STT_CAPTURE_WAIT_MS,
        },
      );
      const deadline = Date.now() + REMOTE_STT_CAPTURE_WAIT_MS;
      while (!getPendingCapture() && Date.now() < deadline) {
        await new Promise<void>(resolve =>
          setTimeout(() => resolve(), REMOTE_STT_CAPTURE_POLL_MS),
        );
      }
    }
    const capturedAudio = getPendingCapture();
    if (!capturedAudio) {
      onFailure(
        'Remote STT audio capture produced no uploadable audio',
        recordingSessionId,
        undefined,
      );
      return false;
    }
    logInfo('AgentOrchestrator', 'remote stt transcription requested', {
      recordingSessionId,
      endpointBaseUrl: getEndpointBaseUrl(),
      filename: capturedAudio.filename,
      durationMillis: capturedAudio.durationMillis,
      sizeBase64Chars: capturedAudio.audioBase64.length,
    });
    logInfo('AgentOrchestrator', 'remote stt awaiting proxy response', {
      recordingSessionId,
      filename: capturedAudio.filename,
    });
    try {
      const result = await transcribeAudio({
      audioBase64: capturedAudio.audioBase64,
      mimeType: capturedAudio.mimeType,
      filename: capturedAudio.filename,
      language: 'en',
      });
      logInfo('AgentOrchestrator', 'remote stt proxy response received', {
        recordingSessionId,
        transcriptChars: result.text.length,
      });
      const normalized = normalizeTranscript(result.text);
      if (!normalized) {
        clearPendingCapture();
        logWarn('AgentOrchestrator', 'remote stt transcript normalized to empty', {
          recordingSessionId,
        });
        onEmptyTranscript?.(recordingSessionId);
        return false;
      }
      clearPendingCapture();
      applyTranscript(normalized);
      logInfo('AgentOrchestrator', 'remote stt transcription succeeded', {
        recordingSessionId,
        transcriptChars: normalized.length,
        transcriptText: normalized,
        transcriptPreview: transcriptPreview(normalized),
      });
      return true;
    } catch (error) {
      const message = toErrorMessage(error);
      const code = isOpenAIProxyError(error) ? error.code : undefined;
      logError('AgentOrchestrator', 'remote stt transcription failed', {
        recordingSessionId,
        message,
        proxyErrorCode: code ?? null,
        endpointBaseUrl: getEndpointBaseUrl(),
      });
      onFailure(message, recordingSessionId, code != null ? { code } : undefined);
      return false;
    }
  };

  return { transcribeCapturedAudioIfNeeded };
}
