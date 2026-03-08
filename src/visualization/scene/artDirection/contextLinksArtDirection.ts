/**
 * Art direction knobs for ContextLinks.
 * Pure data: no render/runtime logic.
 */
export const CONTEXT_LINKS_ART_DIRECTION = {
  pulseSpeed: 4,
  alphaScale: 3.2,
  showConfidenceBelow: 0.7,
  requireFullIntensity: true,
  bezier: {
    controlXAmp: 0.12,
    controlYAmp: 0.06,
    controlZAmp: 0.02,
  },
} as const;
