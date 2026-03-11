/**
 * Shared transient effect: firstToken (first stream chunk received).
 * Authored values only; no runtime logic. Runtime derives modulation from this + event time.
 */

import type { TransientEffectDefinition } from './types';

export const FIRST_TOKEN_EFFECT: TransientEffectDefinition = {
  decayMs: 480,
  modulation: {
    hueShift: 0.06,
    intensity: 0.5,
    agitation: 0.08,
    opacityBias: 0.12,
  },
};
