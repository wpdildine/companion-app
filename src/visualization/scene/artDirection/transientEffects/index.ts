/**
 * Shared transient effect definitions. Data-driven; no runtime logic here.
 * Render layers derive modulation from event identity + timing + these definitions.
 */

import type { TransientVisualSignal } from '../../../runtime/visualizationSignals';
import type { TransientEffectDefinition } from './types';
import { SOFT_FAIL_EFFECT } from './softFail';
import { TERMINAL_FAIL_EFFECT } from './terminalFail';
import { FIRST_TOKEN_EFFECT } from './firstToken';

export type { TransientEffectDefinition } from './types';
export type { TransientModulation } from './types';
export { ZERO_MODULATION } from './types';
export { SOFT_FAIL_EFFECT } from './softFail';
export { TERMINAL_FAIL_EFFECT } from './terminalFail';
export { FIRST_TOKEN_EFFECT } from './firstToken';

const TRANSIENT_EFFECTS: Partial<Record<TransientVisualSignal, TransientEffectDefinition>> = {
  softFail: SOFT_FAIL_EFFECT,
  terminalFail: TERMINAL_FAIL_EFFECT,
  firstToken: FIRST_TOKEN_EFFECT,
};

/**
 * Returns the effect definition for a transient signal, or undefined if not found.
 */
export function getTransientEffect(
  eventId: TransientVisualSignal | string | null,
): TransientEffectDefinition | undefined {
  if (eventId == null) return undefined;
  return TRANSIENT_EFFECTS[eventId as TransientVisualSignal];
}
