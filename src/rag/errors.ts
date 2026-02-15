/**
 * RAG layer structured errors (hard-fail, embed mismatch, etc.).
 * See docs/plugin-contract.md for PluginError shape.
 */

import type { PluginError } from '../types/plugin-contract';

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
  | 'E_COMPLETION';

export function ragError(
  code: RagErrorCode,
  message: string,
  details?: Record<string, unknown>
): PluginError<RagErrorCode> {
  return { code, message, details };
}
