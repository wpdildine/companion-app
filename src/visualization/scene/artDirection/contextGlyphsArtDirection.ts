/**
 * Art direction knobs for ContextGlyphs.
 * Pure data: no render/runtime logic.
 */
export const CONTEXT_GLYPHS_ART_DIRECTION = {
  baseNodeSize: 5.25,
  pulseSpeed: 4,
  touchRadius: 3.6,
  touchStrength: 2.8,
  touchMaxOffset: 1.35,
  zLayers: {
    // Ordered from back to front in world-Z.
    offsets: [-0.24, -0.08, 0.08, 0.24],
    rulesClusterBias: -0.02,
    cardsClusterBias: 0.02,
    jitter: 0.012,
  },
  decay: {
    phaseSeed: 12.9898,
    rateSeed: 78.233,
    depthSeed: 37.719,
    rateMin: 0.25,
    rateMax: 1.4,
    depthMin: 0.12,
    depthMax: 0.47,
  },
} as const;
