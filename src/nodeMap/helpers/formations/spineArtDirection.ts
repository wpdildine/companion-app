/**
 * Central art-direction knobs for the Spine composition.
 * Keep renderer logic out of this file; this is pure visual tuning data.
 */

export const BASE_PLANE_RENDER_ORDER = 901;

export const SPINE_ART_DIRECTION = {
  envelope: {
    width: 0.25,
    height: 2.16,
    centerY: 0,
  },
  visibility: {
    baseOpacity: 0.74,
    opacityBoostFromHalftone: 0.25,
    halftoneOpacityScale: 1.35,
    shardOpacityScale: 0.65,
    halftoneDebugFlat: false,
    blend: 'normal',
  },
  composition: {
    planeCount: 5,
    planeWidthScale: [0.5, 0.62, 0.86, 0.6, 0.48],
    planeHeightScale: [0.82, 0.98, 1.08, 0.92, 0.8],
    planeOffsetX: [-0.15, 0.11, 0.0, -0.09, 0.14],
    planeOffsetY: [0.075, -0.056, 0.0, 0.05, -0.075],
    planeZOffset: [-0.04, 0.07, 0.0, -0.05, 0.03],
    // Opacity ladder: ghost -> support -> hero -> support -> ghost.
    planeOpacityScale: [0.42, 0.72, 0.9, 0.66, 0.38],
    planeColors: ['#425a7d', '#6084b5', '#b8f1ff', '#587bae', '#3a5070'],
    planeAccent: [false, false, true, false, false],
    planeRenderOrder: [
      BASE_PLANE_RENDER_ORDER,
      BASE_PLANE_RENDER_ORDER + 1,
      BASE_PLANE_RENDER_ORDER + 5,
      BASE_PLANE_RENDER_ORDER + 2,
      BASE_PLANE_RENDER_ORDER + 3,
    ],
    planeGap: -0.22,
    zStep: 0.036,
    halftoneEnabled: true,
    halftoneFadeMode: 'none',
    halftoneFadeInner: 0.05,
    halftoneFadeOuter: 0.92,
    halftoneFadePower: 1.2,
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
  halftoneProfiles: {
    // Keep density constant across states so dot spacing never "pops" on mode changes.
    idle: { intensity: 0.48, density: 1.6 },
    listening: { intensity: 0.66, density: 1.6 },
    processing: { intensity: 0.9, density: 1.6 },
    speaking: { intensity: 0.36, density: 1.6 },
  },
  shards: {
    countsByMode: {
      idle: 8,
      listening: 16,
      processing: 20,
      speaking: 10,
    },
    zOffsetMin: -0.8,
    zOffsetMax: 0.8,
    membraneBandOffsetY: 0.22,
    coolPalette: ['#4d78b8', '#41699f', '#5b8dcc', '#36577f'],
    ghostPalette: ['#1f2c43', '#1b263a', '#24334d'],
    accentPalette: ['#8ce7ff', '#c5f6ff'],
    accentColor: '#b6f0ff',
  },
} as const;
