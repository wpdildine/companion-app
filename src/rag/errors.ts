/**
 * RAG layer structured errors (hard-fail, embed mismatch, etc.).
 * See docs/plugin-contract.md for PluginError shape.
 * `details.attribution.error_kind` aligns with pack_runtime docs/FAILURE_ATTRIBUTION_VOCABULARY.md.
 */

import type { PluginError } from '../shared/types/plugin-contract';

/** True empty context after proceed_to_retrieval (distinct from front-door blocked). */
export const CONTEXT_RETRIEVAL_EMPTY = 'context.retrieval_empty' as const;

/** Bundle load / assembly failure at context layer (not retrieval-empty). */
export const CONTEXT_BUNDLE_ERROR = 'context.bundle_error' as const;

export function readAttributionErrorKind(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const details =
    'details' in error ? (error as { details?: unknown }).details : undefined;
  if (!details || typeof details !== 'object') return undefined;
  const attribution =
    'attribution' in details
      ? (details as { attribution?: unknown }).attribution
      : undefined;
  if (!attribution || typeof attribution !== 'object') return undefined;
  if (!('error_kind' in attribution)) return undefined;
  return String((attribution as { error_kind: unknown }).error_kind);
}

export function ragErrorWithAttribution(
  code: RagErrorCode,
  message: string,
  errorKind: string,
): PluginError<RagErrorCode> {
  return ragError(code, message, {
    attribution: { error_kind: errorKind },
  });
}

export type RagErrorCode =
  | 'E_PACK_LOAD'
  | 'E_PACK_SCHEMA'
  | 'E_RETRIEVAL_FORMAT'
  | 'E_VALIDATE_CAPABILITY'
  | 'E_VALIDATE_SCHEMA'
  | 'E_EMBED_MISMATCH'
  | 'E_INDEX_META'
  | 'E_COUNTS_MISMATCH'
  | 'E_NOT_INITIALIZED'
  | 'E_EMBED'
  | 'E_RETRIEVAL'
  | 'E_COMPLETION'
  | 'E_MODEL_PATH'
  | 'E_OLLAMA'
  | 'E_DETERMINISTIC_ONLY';

export function ragError(
  code: RagErrorCode,
  message: string,
  details?: Record<string, unknown>
): PluginError<RagErrorCode> {
  return { code, message, details };
}
