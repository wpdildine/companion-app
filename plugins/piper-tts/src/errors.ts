/**
 * Piper TTS error codes (plugin contract: structured errors).
 * See docs/plugin-contract.md.
 */

import type { PluginError } from '../../../src/types/plugin-contract';

export type PiperErrorCode =
  | 'E_NOT_LINKED'
  | 'E_INVALID'
  | 'E_NO_MODEL'
  | 'E_CONFIG'
  | 'E_PHONEME'
  | 'E_ORT'
  | 'E_AUDIO'
  | 'E_PIPER'
  | 'E_CANCELLED'
  | 'E_INTERNAL';

export type PiperPluginError = PluginError<PiperErrorCode>;

/**
 * Normalize a native rejection (code, message) or Error into PiperPluginError.
 */
export function toPiperError(
  code: string,
  message: string,
  details?: Record<string, unknown> | null
): PiperPluginError {
  return { code: code as PiperErrorCode, message, details: details ?? undefined };
}
