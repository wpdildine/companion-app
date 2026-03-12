/**
 * Shared transient effect: terminalFail (terminal request failure).
 * Authored values only; no runtime logic. Runtime derives modulation from this + event time.
 */

import type { TransientEffectDefinition } from './types';

export const TERMINAL_FAIL_EFFECT: TransientEffectDefinition = {
  decayMs: 980,
  modulation: {
    hueShift: -0.28,
    intensity: 1.35,
    agitation: 0.1,
    opacityBias: 0.42,
  },
};
