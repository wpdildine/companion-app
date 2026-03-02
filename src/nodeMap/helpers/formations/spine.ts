/**
 * Spine scene description: 5-plane AI channel, envelope, spread/halftone profiles.
 * Built here; composed by formations.ts getSceneDescription(). Canonical modes only.
 */

/** Canonical states for spine spread/halftone profiles. Non-canonical modes (e.g. touched, released) are mapped to one of these in the renderer. */
export type CanonicalSpineMode =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking';

/** Spread multipliers per canonical state (vertical spacing, band width, depth). */
export type SpineSpreadProfile = {
  verticalSpread: number;
  bandWidth: number;
  depthSpread: number;
};

/** Halftone params per canonical state (for future band-edge halftone). */
export type SpineHalftoneProfile = {
  intensity: number;
  density: number;
};

/** Profiles keyed only by canonical mode. */
export type CanonicalSpreadProfiles = Record<
  CanonicalSpineMode,
  SpineSpreadProfile
>;
export type CanonicalHalftoneProfiles = Record<
  CanonicalSpineMode,
  SpineHalftoneProfile
>;

/**
 * Envelope in NDC. Same convention as TouchZones: vertical axis is the active region (below bandTopInsetPx), not full canvas.
 * centerY is in active-region NDC (below bandTopInsetPx), not full viewport NDC.
 */
export type SpineEnvelopeNdc = {
  /** Width in NDC (e.g. matches center strip). */
  width: number;
  /** Height in NDC along active region vertical. */
  height: number;
  /**
   * Vertical center of the spine strip in active-region NDC.
   * centerY is in active-region NDC (below bandTopInsetPx), not full viewport NDC.
   * 0 = center of active region; range [-1, 1] along active height.
   */
  centerY: number;
};

export type GLSceneSpineStyle = {
  color: string;
  opacity: number;
  blend?: 'additive' | 'normal';
  /** Camera-facing overlay distance from camera in world units. */
  overlayDistance: number;
  zStep: number;
  /** Relative horizontal offsets by plane index (length must equal planeCount). */
  planeOffsetX: number[];
  /** Relative width scale by plane index (length must equal planeCount). */
  planeWidthScale: number[];
  /** Relative opacity multipliers by plane index (length must equal planeCount). */
  planeOpacityScale: number[];
  /**
   * Gap between planes as a fraction of plane height.
   * Negative values create overlap (planes occlude); core decon for idle.
   */
  planeGap: number;
  /** Per-plane vertical offset in envelope-height fractions (misregistration). Length = planeCount. */
  planeOffsetY: number[];
  /** Per-plane height scale (unitHeight * scale). Length = planeCount. Middle taller, ends shorter = composed stack. */
  planeHeightScale: number[];
  /** Per-plane hex color (tonal hierarchy). Length = planeCount. Center strongest luminance, outer dimmer. */
  planeColors: string[];
  /** Per-mode micro drift amplitudes in world-space envelope fractions. */
  driftAmpX: number;
  driftAmpY: number;
  /** Scale for per-plane independent drift (amplitude relative to envelope). */
  perPlaneDriftScale: number;
  /** Phase step per plane index so planes don't move in lockstep (radians or multiplier). */
  perPlaneDriftPhaseStep: number;
  /** Drift frequency in Hz-like scalar. */
  driftHz: number;
  /** Idle/listening breathing: amplitude multiplier (e.g. 0.06 => ±6% on spread). */
  idleBreathAmp: number;
  /** Idle/listening breathing: frequency in Hz (e.g. 0.12 => ~8.3s period). */
  idleBreathHz: number;
  /** Extra width multiplier in processing to express overflow intent. */
  processingOverflowBoost: number;
  /** Extra overlap in processing (added to planeGap, e.g. -0.06 => more compressed stack). */
  processingExtraOverlap: number;
  /** Height scale multiplier per plane in processing (e.g. 1.08 => slightly taller). */
  processingHeightBoost: number;
  /** Drift rate multiplier in processing (e.g. 1.25 => faster motion). */
  processingMotionBoost: number;
  /** Edge band width multiplier in processing (e.g. 1.15 => stronger edges). */
  processingEdgeBoost: number;
  /** Width of shard slivers as fraction of envelope width (e.g. 0.28). */
  shardWidthScale: number;
  /** Edge-band overlay style (halftone carrier). */
  edgeBandWidth: number;
  edgeOpacity: number;
};

/** Single sliver plane behind/around the main stack. offsetX/zOffset in envelope fractions and zStep units. */
export type SpineShard = {
  /** X offset as fraction of envelope width (-0.5..0.5). */
  offsetX: number;
  /** Height as fraction of main plane unit height (e.g. 0.12–0.35). */
  heightScale: number;
  /** Z in zStep units; negative = behind main stack. */
  zOffset: number;
  /** Opacity multiplier (e.g. 0.5–0.8). */
  opacityScale: number;
};

export type GLSceneSpine = {
  planeCount: 5;
  envelopeNdc: SpineEnvelopeNdc;
  style: GLSceneSpineStyle;
  /** Secondary thin sliver planes (2–4), seeded layout. */
  shards: SpineShard[];
  transitionMsIn: number;
  transitionMsOut: number;
  easing?: 'cubic' | 'inOutCubic';
  spreadProfiles: CanonicalSpreadProfiles;
  halftoneProfiles: CanonicalHalftoneProfiles;
};

const SPREAD_IDLE: SpineSpreadProfile = {
  verticalSpread: 1.0,
  bandWidth: 1.0,
  depthSpread: 1.0,
};
const SPREAD_LISTENING: SpineSpreadProfile = {
  verticalSpread: 1.15,
  bandWidth: 1.0,
  depthSpread: 1.0,
};
const SPREAD_PROCESSING: SpineSpreadProfile = {
  verticalSpread: 1.3,
  bandWidth: 1.1,
  depthSpread: 1.18,
};
const SPREAD_SPEAKING: SpineSpreadProfile = {
  verticalSpread: 1.0,
  bandWidth: 1.0,
  depthSpread: 1.0,
};

const HALFTONE_IDLE: SpineHalftoneProfile = { intensity: 0, density: 1 };
const HALFTONE_LISTENING: SpineHalftoneProfile = {
  intensity: 0.12,
  density: 1.0,
};
const HALFTONE_PROCESSING: SpineHalftoneProfile = {
  intensity: 0.6,
  density: 2.2,
};
const HALFTONE_SPEAKING: SpineHalftoneProfile = {
  intensity: 0,
  density: 1.0,
};

/** Seeded RNG for deterministic shard layout (minimal standard LCG). */
function createSeededRng(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

/** Build 2–4 shard descriptors with seeded random layout (behind/around main stack). */
function buildShards(seed: number): SpineShard[] {
  const rng = createSeededRng(seed);
  const count = 2 + Math.floor(rng() * 3); // 2, 3, or 4
  const shards: SpineShard[] = [];
  for (let i = 0; i < count; i++) {
    shards.push({
      offsetX: (rng() - 0.5) * 0.85,
      heightScale: 0.12 + rng() * 0.24,
      zOffset: -3.2 + rng() * 1.4,
      opacityScale: 0.5 + rng() * 0.32,
    });
  }
  return shards;
}

/**
 * Build spine description with canonical table defaults. Composed by getSceneDescription().
 */
export function buildSpineDescription(): GLSceneSpine {
  const planeCount = 5 as const;
  return {
    planeCount,
    envelopeNdc: {
      width: 0.18,
      height: 1.86,
      centerY: 0,
    },
    style: {
      color: '#b7d2ff',
      /** High enough that planeColors read over dark canvas; 0.34 blended everything to drab grey. */
      opacity: 0.62,
      /** Normal blending so planeColors read as tonal hierarchy; additive washes the stack to one tone. */
      blend: 'normal',
      overlayDistance: 10,
      zStep: 0.02,
      planeOffsetX: [-0.018, 0.01, 0.0, -0.008, 0.016],
      planeWidthScale: [0.88, 0.96, 1.06, 0.94, 0.86],
      planeOpacityScale: [0.78, 0.88, 1.0, 0.86, 0.74],
      planeGap: -0.12,
      planeOffsetY: [0.02, -0.01, 0.0, 0.015, -0.02],
      planeHeightScale: [0.82, 0.92, 1.22, 0.9, 0.84],
      planeColors: ['#8a9fc9', '#9eb3e0', '#e84a4a', '#a2b8e8', '#889bc4'],
      driftAmpX: 0.028,
      driftAmpY: 0.02,
      perPlaneDriftScale: 0.8,
      perPlaneDriftPhaseStep: 1.4,
      driftHz: 0.22,
      idleBreathAmp: 0.06,
      idleBreathHz: 0.12,
      processingOverflowBoost: 1.12,
      processingExtraOverlap: -0.06,
      processingHeightBoost: 1.08,
      processingMotionBoost: 1.25,
      processingEdgeBoost: 1.15,
      shardWidthScale: 0.28,
      edgeBandWidth: 0.22,
      edgeOpacity: 0.34,
    },
    shards: buildShards(42),
    transitionMsIn: 220,
    transitionMsOut: 280,
    easing: 'inOutCubic',
    spreadProfiles: {
      idle: SPREAD_IDLE,
      listening: SPREAD_LISTENING,
      processing: SPREAD_PROCESSING,
      speaking: SPREAD_SPEAKING,
    },
    halftoneProfiles: {
      idle: HALFTONE_IDLE,
      listening: HALFTONE_LISTENING,
      processing: HALFTONE_PROCESSING,
      speaking: HALFTONE_SPEAKING,
    },
  };
}
