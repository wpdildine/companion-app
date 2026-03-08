/**
 * Shared transient effect definitions. Data-driven; no runtime logic here.
 * Render layers derive modulation from event identity + timing + these definitions.
 */

import type { TransientVisualSignal } from '../../../engine/signals';
import type { TransientEffectDefinition } from './types';
import { SOFT_FAIL_EFFECT } from './softFail';

export type { TransientEffectDefinition } from './types';
export type { TransientModulation } from './types';
export { ZERO_MODULATION } from './types';
export { SOFT_FAIL_EFFECT } from './softFail';

const TRANSIENT_EFFECTS: Partial<Record<TransientVisualSignal, TransientEffectDefinition>> = {
  softFail: SOFT_FAIL_EFFECT,
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
