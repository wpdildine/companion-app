/**
 * Spine base preset: slab planes (count, sizes, offsets, opacity ladder, render order).
 * Composed by spineArtDirection.ts; do not import from render/build.
 */

/** Base render order for spine planes; higher values draw in front. */
export const BASE_PLANE_RENDER_ORDER = 901;

export const SPINE_BASE_PRESET = {
  envelope: {
    width: 0.29,
    height: 2.28,
    centerY: 0,
  },
  visibility: {
    baseOpacity: 0.74,
    opacityBoostFromHalftone: 0.2,
    halftoneOpacityScale: 1.25,
    shardOpacityScale: 0.9,
    halftoneDebugFlat: false,
    blend: 'normal',
  },
  composition: {
    planeCount: 5,
    planeWidthScale: [0.62, 0.76, 1.02, 0.74, 0.58],
    planeHeightScale: [0.86, 1.02, 1.12, 0.96, 0.82],
    planeOffsetY: [0.16, -0.12, 0.0, 0.11, -0.16],
    planeOffsetX: [-0.24, 0.18, 0.0, -0.17, 0.23],
    planeZOffset: [-0.12, 0.1, -0.26, -0.04, 0.08],
    planeOpacityScale: [0.2, 0.56, 0.82, 0.5, 0.16],
    planeColors: ['#5bcfe6', '#6fdcf2', '#95f8ff', '#68d7ee', '#52c7df'],
    planeAccent: [false, false, true, true, false],
    planeRenderOrder: [1, 2, 0, 3, 4],
    planeGap: -0.24,
    zStep: 0.02,
    halftoneEnabled: true,
    halftoneFadeMode: 'angled',
    halftoneFadeInner: 0.08,
    halftoneFadeOuter: 0.88,
    halftoneFadePower: 1.6,
    halftoneFadeAngle: -1.18,
    halftoneFadeOffset: 0.0,
    halftoneFadeCenterX: 0.52,
    halftoneFadeCenterY: 0.54,
    halftoneFadeLevels: 4,
    halftoneFadeStepMix: 0.2,
    halftoneFadeOneSided: true,
    edgeGlowStrength: 0.56,
    edgeGlowWidth: 0.062,
    edgeGlowColor: '#8fe9ff',
    beamHalfWidthFrac: 0.17,
    edgeYWeight: 0.08,
  },
  motion: {
    driftAmpX: 0.042,
    driftAmpY: 0.028,
    driftHz: 0.14,
    idleBreathAmp: 0.04,
    idleBreathHz: 0.1,
    perPlaneDriftScale: 0.62,
    perPlaneDriftPhaseStep: 1.2,
    processingOverflowBoost: 1.12,
    processingExtraOverlap: -0.06,
    processingHeightBoost: 1.08,
    processingMotionBoost: 4.0,
    processingEdgeBoost: 1.15,
  },
} as const;
