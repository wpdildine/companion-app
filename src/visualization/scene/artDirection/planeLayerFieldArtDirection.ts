/**
 * Art direction knobs for PlaneLayerField.
 * Pure data: no render/runtime logic.
 */
export const PLANE_FIELD_ART_DIRECTION = {
  opacityClampMin: 0.25,
  opacityClampMax: 0.65,
  noisePhaseSpeed: 0.12,
  smoothingSeconds: 0.2,
  intensity: {
    processingBase: 0.85,
    processingActivityGain: 0.15,
    idleBase: 0.6,
    idleActivityGain: 0.25,
  },
  thresholdOscillation: {
    base: 0.38,
    amp: 0.08,
    hz: 0.4,
  },
  scaleOscillation: {
    base: 0.92,
    amp: 0.12,
    hz: 0.28,
  },
  planeDepth: {
    base: 6.5,
    detail: 6.7,
  },
  planeScale: {
    base: 1.22,
    detail: 1.6,
  },
  panel: {
    opacityScale: 0.48,
    answerOpacityScale: 0.65,
    cardsOpacityScale: 1.0,
    rulesOpacityScale: 0.95,
    rulesHueShift: {
      h: 0.02,
      s: 0.02,
      l: 0.03,
    },
    depth: {
      answer: 6.2,
      cards: 6.3,
      rules: 6.35,
    },
  },
} as const;
