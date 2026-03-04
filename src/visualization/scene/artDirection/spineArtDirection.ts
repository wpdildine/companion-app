/**
 * Central art-direction knobs for the Spine composition.
 * Keep renderer logic out of this file; this is pure visual tuning data.
 */

/** Base render order for spine planes; higher values draw in front. */
export const BASE_PLANE_RENDER_ORDER = 901;

export const SPINE_ART_DIRECTION = {
  // ---------------------------------------------------------------------------
  // Envelope — spine bounding box and vertical centering (world units).
  // ---------------------------------------------------------------------------
  envelope: {
    width: 0.25,
    height: 2.16,
    centerY: 0,
  },

  // ---------------------------------------------------------------------------
  // Visibility — base opacity, halftone/shard multipliers, blend, debug flat.
  // ---------------------------------------------------------------------------
  visibility: {
    baseOpacity: 0.72,
    opacityBoostFromHalftone: 0.18,
    halftoneOpacityScale: 1.25,
    shardOpacityScale: 0.72,
    halftoneDebugFlat: false,
    blend: 'normal',
  },

  // ---------------------------------------------------------------------------
  // Composition — plane layout, stacking, halftone fade. Per-plane arrays
  // index 0..planeCount-1: widthScale, heightScale, offsetX/Y, zOffset,
  // opacityScale, colors, accent, renderOrder. Plus planeGap, zStep, and
  // halftone fade knobs (mode, inner/outer, power, angle, center, levels, etc.).
  // ---------------------------------------------------------------------------
  composition: {
    planeCount: 5,
    planeWidthScale: [0.56, 0.68, 0.94, 0.66, 0.54],
    planeHeightScale: [0.82, 0.98, 1.08, 0.92, 0.8],
    planeOffsetY: [0.11, -0.085, 0.0, 0.075, -0.11],
    planeOffsetX: [-0.19, 0.14, 0.0, -0.12, 0.17],
    planeZOffset: [-0.06, 0.08, -0.55, -0.06, 0.04],
    planeOpacityScale: [0.82, 0.86, 1.0, 0.84, 0.78],
    planeColors: [
      '#344a73', // ghost deep (brighter)
      '#5c87d3', // support
      '#bff6ff', // hero
      '#5a86d0', // support
      '#2f4468', // ghost deep (brighter)
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

  // ---------------------------------------------------------------------------
  // Motion — idle drift (amplitude, Hz, per-plane phase), breath, and
  // processing-mode boosts (overflow, overlap, height, motion, edge).
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Halftone profiles — dot intensity and density per mode (idle, listening,
  // processing, speaking). Density kept constant to avoid pop on mode change.
  // ---------------------------------------------------------------------------
  halftoneProfiles: {
    idle: { intensity: 0.48, density: 1.6 },
    listening: { intensity: 0.66, density: 1.6 },
    processing: { intensity: 0.9, density: 1.6 },
    speaking: { intensity: 0.36, density: 1.6 },
  },

  // ---------------------------------------------------------------------------
  // Shards — max count per mode, z range (zOffsetMin/Max), membrane band
  // offset, and palettes (cool, ghost, accent, accentColor).
  // ---------------------------------------------------------------------------
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
