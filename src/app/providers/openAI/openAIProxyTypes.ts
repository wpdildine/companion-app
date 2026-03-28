/**
 * Public types for the OpenAI proxy hook. The app must not parse raw OpenAI payloads;
 * the hook normalizes proxy output into these shapes.
 */

// --- /api/stt ---

export interface TranscribeAudioParams {
  audioBase64: string;
  mimeType?: string;
  filename?: string;
  language?: string;
}

export interface TranscribeAudioResult {
  text: string;
  /**
   * Optional; intended only for debugging/inspection during early integration.
   * Callers must not depend on raw; the transport seam must not leak proxy internals.
   */
  raw?: unknown;
}

// --- /api/respond ---

export interface RespondParams {
  prompt: string;
  system?: string;
}

/** Explicit usage shape; not a loose object. */
export interface RespondUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface RespondResult {
  text: string;
  model?: string;
  usage?: RespondUsage;
  /**
   * Optional; intended only for debugging/inspection during early integration.
   * Callers must not depend on raw.
   */
  raw?: unknown;
}

// --- Normalized errors ---

export interface OpenAIProxyError {
  message: string;
  code?: string;
}

/** Normalize transport errors thrown by the proxy hook (not `Error` instances). */
export function isOpenAIProxyError(error: unknown): error is OpenAIProxyError {
  return (
    error != null &&
    typeof error === 'object' &&
    !(error instanceof Error) &&
    typeof (error as OpenAIProxyError).message === 'string'
  );
}

// Backward-compatible aliases while the rest of the app adopts the plan naming.
export type SttRequest = TranscribeAudioParams;
export type SttResult = TranscribeAudioResult;
export type RespondRequest = RespondParams;
