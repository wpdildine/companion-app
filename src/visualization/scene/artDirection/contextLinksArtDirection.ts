/**
 * Art direction knobs for ContextLinks.
 * Pure data: no render/runtime logic.
 */
export const CONTEXT_LINKS_ART_DIRECTION = {
  pulseSpeed: 4,
  showConfidenceBelow: 0.7,
  requireFullIntensity: true,
  bezier: {
    controlXAmp: 0.2,
    controlYAmp: 0.1,
    controlZAmp: 0.03,
  },
} as const;
