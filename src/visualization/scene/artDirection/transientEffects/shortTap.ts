/**
 * Shared transient effect: shortTap (gesture incomplete).
 * Authored values only; no runtime logic. Runtime derives modulation from this + event time.
 */

import type { TransientEffectDefinition } from './types';

export const SHORT_TAP_EFFECT: TransientEffectDefinition = {
  decayMs: 140,
  modulation: {
    hueShift: -1.0,
    opacityBias: 0.8,
    agitation: 0.9,
    intensity: 1,
    centerPulseOnly: false,
  },
};
