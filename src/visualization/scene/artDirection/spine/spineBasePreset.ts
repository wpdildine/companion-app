/**
 * Spine base preset: slab planes (count, sizes, offsets, opacity ladder, render order).
 * Composed by spineArtDirection.ts; do not import from render/build.
 */

/** Base render order for spine planes; higher values draw in front. */
export const BASE_PLANE_RENDER_ORDER = 901;

export const SPINE_BASE_PRESET = {
  envelope: {
    width: 0.25,
    height: 2.16,
    centerY: 0,
  },
  visibility: {
    baseOpacity: 0.72,
    opacityBoostFromHalftone: 0.18,
    halftoneOpacityScale: 1.25,
    shardOpacityScale: 0.72,
    halftoneDebugFlat: false,
    blend: 'normal',
  },
  composition: {
    planeCount: 5,
    planeWidthScale: [0.56, 0.68, 0.94, 0.66, 0.54],
    planeHeightScale: [0.82, 0.98, 1.08, 0.92, 0.8],
    planeOffsetY: [0.11, -0.085, 0.0, 0.075, -0.11],
    planeOffsetX: [-0.19, 0.14, 0.0, -0.12, 0.17],
    planeZOffset: [-0.06, 0.08, -0.55, -0.06, 0.04],
    planeOpacityScale: [0.82, 0.86, 1.0, 0.84, 0.78],
    planeColors: [
      '#344a73',
      '#5c87d3',
      '#bff6ff',
      '#5a86d0',
      '#2f4468',
    ],
    planeAccent: [false, false, true, false, false],
    planeRenderOrder: [
      BASE_PLANE_RENDER_ORDER,
      BASE_PLANE_RENDER_ORDER + 1,
      BASE_PLANE_RENDER_ORDER + 5,
      BASE_PLANE_RENDER_ORDER + 2,
      BASE_PLANE_RENDER_ORDER + 3,
    ],
    planeGap: -0.22,
    zStep: 0.02,
    halftoneEnabled: true,
    halftoneFadeMode: 'angled',
    halftoneFadeInner: 0.12,
    halftoneFadeOuter: 1.05,
    halftoneFadePower: 2.0,
    halftoneFadeAngle: -1.57 * 1.25,
    halftoneFadeOffset: 0.0,
    halftoneFadeCenterX: 0.48,
    halftoneFadeCenterY: 0.62,
    halftoneFadeLevels: 5,
    halftoneFadeStepMix: 0.45,
    halftoneFadeOneSided: true,
  },
  motion: {
    driftAmpX: 0.038,
    driftAmpY: 0.025,
    driftHz: 0.14,
    idleBreathAmp: 0.04,
    idleBreathHz: 0.1,
    perPlaneDriftScale: 0.62,
    perPlaneDriftPhaseStep: 1.2,
    processingOverflowBoost: 1.12,
    processingExtraOverlap: -0.06,
    processingHeightBoost: 1.08,
    processingMotionBoost: 1.25,
    processingEdgeBoost: 1.15,
  },
} as const;
