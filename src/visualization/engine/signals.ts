/**
 * Transient visual signals: single source of truth for short-lived visual accents.
 * Used for controller emission, engine typing, validation, and pulse/event mapping.
 * Do not scatter raw string literals; reference this module.
 */

export type TransientVisualSignal = 'softFail';

export const VALID_TRANSIENT_SIGNALS: readonly TransientVisualSignal[] = ['softFail'];

export const TRANSIENT_SIGNAL_SOFT_FAIL: TransientVisualSignal = 'softFail';

export function isTransientVisualSignal(s: string | null): s is TransientVisualSignal {
  return s !== null && (VALID_TRANSIENT_SIGNALS as readonly string[]).includes(s);
}
