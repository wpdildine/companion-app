/**
 * Shared transient effect: softFail (recoverable attempt failure).
 * Authored values only; no runtime logic. Runtime derives modulation from this + event time.
 */

import type { TransientEffectDefinition } from './types';

export const SOFT_FAIL_EFFECT: TransientEffectDefinition = {
  decayMs: 650,
  modulation: {
    hueShift: 0.35,
    intensity: 1,
    agitation: 0.52,
    opacityBias: 0.4,
  },
};
