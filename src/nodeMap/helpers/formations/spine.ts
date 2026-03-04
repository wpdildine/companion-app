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

/** Halftone fade mode: none = full coverage, radial/linear = parameterized falloff. */
export type HalftoneFadeMode = 'none' | 'radial' | 'linear';

/**
 * Spine style preset: single source of truth for plane count, per-plane arrays,
 * zStep, planeGap, and idle drift. Spine.tsx consumes scene.spine only; arrays come from here.
 */
export type SpineStylePreset = {
  planeCount: 5;
  planeWidthScale: number[];
  planeHeightScale: number[];
  planeOffsetX: number[];
  planeOffsetY: number[];
  planeZOffset: number[];
  planeOpacityScale: number[];
  planeColors: string[];
  /** Deterministic front-to-back render order (length = planeCount). */
  planeRenderOrder: number[];
  planeAccent: boolean[];
  zStep: number;
  planeGap: number;
  driftAmpX: number;
  driftAmpY: number;
  driftHz: number;
  idleBreathAmp: number;
  idleBreathHz: number;
  perPlaneDriftScale: number;
  perPlaneDriftPhaseStep: number;
  /** Halftone on central plane: scene-driven; default true so release is not gated by debug flag. */
  halftoneEnabled: boolean;
  halftoneFadeMode: HalftoneFadeMode;
  halftoneFadeInner: number;
  halftoneFadeOuter: number;
  halftoneFadePower: number;
};

export type GLSceneSpineStyle = {
  color: string;
  opacity: number;
  /** Global opacity response to halftone intensity: final = 1 + intensity * factor. */
  opacityBoostFromHalftone: number;
  /** Extra alpha multiplier for center halftone membrane. */
  halftoneOpacityScale: number;
  /** Global shard opacity multiplier. */
  shardOpacityScale: number;
  /** Debug art lock: render halftone as flat slab (no dots/fade) for visibility checks. */
  halftoneDebugFlat: boolean;
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
  /** Per-plane z offset in zStep units (de-stacking). Length = planeCount. */
  planeZOffset: number[];
  /** Per-plane hex color (tonal hierarchy). Length = planeCount. Center strongest luminance, outer dimmer. */
  planeColors: string[];
  /** Deterministic front-to-back render order. Spine consumes only; do not compute in renderer. Length = planeCount. */
  planeRenderOrder: number[];
  /** Per-plane emissive accent (additive blend). Length = planeCount. */
  planeAccent: boolean[];
  /** When true, central plane uses halftone shader (scene-driven; debug flag may override). */
  halftoneEnabled: boolean;
  halftoneFadeMode: HalftoneFadeMode;
  halftoneFadeInner: number;
  halftoneFadeOuter: number;
  halftoneFadePower: number;
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
  /** Y offset as fraction of envelope height (-0.5..0.5). */
  offsetY: number;
  /** Height as fraction of main plane unit height (e.g. 0.12–0.35). */
  heightScale: number;
  /** Width as fraction of envelope width. */
  widthScale: number;
  /** Z in zStep units; negative = behind main stack. */
  zOffset: number;
  /** Opacity multiplier (e.g. 0.5–0.8). */
  opacityScale: number;
  /** Per-shard tonal color for depth hierarchy. */
  color: string;
  /** Phase seed for deterministic micro drift. */
  driftPhase: number;
  /** Relative drift amplitude scale. */
  driftScale: number;
  /** Relative drift rate scale. */
  driftRateScale: number;
  /** When true, shard uses additive blending (emissive accent). */
  accent?: boolean;
};

export type GLSceneSpine = {
  planeCount: 5;
  envelopeNdc: SpineEnvelopeNdc;
  style: GLSceneSpineStyle;
  /** Secondary thin sliver planes (2–4), seeded layout. */
  shards: SpineShard[];
  /** Mode-specific visible shard counts for depth stack presence. */
  shardCountByMode: Record<CanonicalSpineMode, number>;
  transitionMsIn: number;
  transitionMsOut: number;
  easing?: 'cubic' | 'inOutCubic';
  spreadProfiles: CanonicalSpreadProfiles;
  halftoneProfiles: CanonicalHalftoneProfiles;
};

/**
 * Single spine style preset. Arrays are source of truth; Spine.tsx consumes via scene.spine.
 * Constraints: widthScale (≥2 ≤0.55, ≥1 ≥0.85), offsetX (≥2 opposite signs), offsetY (≥1 non-zero),
 * opacityScale (≥1 ≤0.55, ≥1 ≥0.9), planeColors (≥1 accent, 3–5 tones).
 */
/** Base render order for spine planes; formations provides per-plane offsets so order is deterministic. */
const BASE_PLANE_RENDER_ORDER = 901;

/**
 * Single tuning hierarchy for art direction.
 * Adjust values here first; downstream builders consume this object.
 */
const SPINE_ART_DIRECTION = {
  envelope: {
    width: 0.25,
    height: 1.86,
    centerY: 0,
  },
  visibility: {
    baseOpacity: 0.62,
    opacityBoostFromHalftone: 0.25,
    halftoneOpacityScale: 1.1,
    shardOpacityScale: 0.46,
    halftoneDebugFlat: false,
    blend: 'normal' as const,
  },

  composition: {
    planeCount: 5 as const,
    planeWidthScale: [0.5, 0.62, 0.86, 0.6, 0.48],
    planeHeightScale: [0.82, 0.98, 1.08, 0.92, 0.8],
    planeOffsetX: [-0.12, 0.09, 0.0, -0.07, 0.11],
    planeOffsetY: [0.06, -0.045, 0.0, 0.04, -0.06],
    planeZOffset: [-0.04, 0.07, 0.0, -0.05, 0.03],
    // Opacity ladder: ghost -> support -> hero -> support -> ghost
    planeOpacityScale: [0.34, 0.56, 0.86, 0.5, 0.3],
    planeColors: ['#425a7d', '#6084b5', '#b8f1ff', '#587bae', '#3a5070'],
    planeAccent: [false, false, true, false, false],
    planeRenderOrder: [
      BASE_PLANE_RENDER_ORDER,
      BASE_PLANE_RENDER_ORDER + 1,
      BASE_PLANE_RENDER_ORDER + 5,
      BASE_PLANE_RENDER_ORDER + 2,
      BASE_PLANE_RENDER_ORDER + 3,
    ],
    planeGap: -0.14,
    zStep: 0.036,
    halftoneEnabled: true,
    halftoneFadeMode: 'none' as HalftoneFadeMode,
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
    idle: { intensity: 0.48, density: 1.35 },
    listening: { intensity: 0.66, density: 1.85 },
    processing: { intensity: 0.9, density: 2.25 },
    speaking: { intensity: 0.36, density: 1.2 },
  } as CanonicalHalftoneProfiles,
  shards: {
    countsByMode: {
      idle: 12,
      listening: 16,
      processing: 20,
      speaking: 10,
    } as Record<CanonicalSpineMode, number>,
    zOffsetMin: -0.8,
    zOffsetMax: 0.8,
    membraneBandOffsetY: 0.22,
    coolPalette: ['#4d78b8', '#41699f', '#5b8dcc', '#36577f'],
    ghostPalette: ['#1f2c43', '#1b263a', '#24334d'],
    accentPalette: ['#8ce7ff', '#c5f6ff'],
    accentColor: '#b6f0ff',
  },
} as const;

export const SPINE_STYLE_PRESET: SpineStylePreset = {
  planeCount: SPINE_ART_DIRECTION.composition.planeCount,
  planeWidthScale: [...SPINE_ART_DIRECTION.composition.planeWidthScale],
  planeHeightScale: [...SPINE_ART_DIRECTION.composition.planeHeightScale],
  planeOffsetX: [...SPINE_ART_DIRECTION.composition.planeOffsetX],
  planeOffsetY: [...SPINE_ART_DIRECTION.composition.planeOffsetY],
  planeZOffset: [...SPINE_ART_DIRECTION.composition.planeZOffset],
  planeOpacityScale: [...SPINE_ART_DIRECTION.composition.planeOpacityScale],
  planeColors: [...SPINE_ART_DIRECTION.composition.planeColors],
  planeRenderOrder: [...SPINE_ART_DIRECTION.composition.planeRenderOrder],
  planeAccent: [...SPINE_ART_DIRECTION.composition.planeAccent],
  zStep: SPINE_ART_DIRECTION.composition.zStep,
  planeGap: SPINE_ART_DIRECTION.composition.planeGap,
  driftAmpX: SPINE_ART_DIRECTION.motion.driftAmpX,
  driftAmpY: SPINE_ART_DIRECTION.motion.driftAmpY,
  driftHz: SPINE_ART_DIRECTION.motion.driftHz,
  idleBreathAmp: SPINE_ART_DIRECTION.motion.idleBreathAmp,
  idleBreathHz: SPINE_ART_DIRECTION.motion.idleBreathHz,
  perPlaneDriftScale: SPINE_ART_DIRECTION.motion.perPlaneDriftScale,
  perPlaneDriftPhaseStep: SPINE_ART_DIRECTION.motion.perPlaneDriftPhaseStep,
  halftoneEnabled: SPINE_ART_DIRECTION.composition.halftoneEnabled,
  halftoneFadeMode: SPINE_ART_DIRECTION.composition.halftoneFadeMode,
  halftoneFadeInner: SPINE_ART_DIRECTION.composition.halftoneFadeInner,
  halftoneFadeOuter: SPINE_ART_DIRECTION.composition.halftoneFadeOuter,
  halftoneFadePower: SPINE_ART_DIRECTION.composition.halftoneFadePower,
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

const HALFTONE_IDLE = SPINE_ART_DIRECTION.halftoneProfiles.idle;
const HALFTONE_LISTENING = SPINE_ART_DIRECTION.halftoneProfiles.listening;
const HALFTONE_PROCESSING = SPINE_ART_DIRECTION.halftoneProfiles.processing;
const HALFTONE_SPEAKING = SPINE_ART_DIRECTION.halftoneProfiles.speaking;

/** Seeded RNG for deterministic shard layout (minimal standard LCG). */
function createSeededRng(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * Build support shards: small set (4–8), biased around halftone membrane, one crosses silhouette (≥25% plane width), zOffset ∈ [-0.5, 0.5].
 */
function buildSupportShards(seed: number, count: number): SpineShard[] {
  const rng = createSeededRng(seed);
  const {
    coolPalette,
    ghostPalette,
    accentPalette,
    zOffsetMin,
    zOffsetMax,
    membraneBandOffsetY,
    accentColor,
  } = SPINE_ART_DIRECTION.shards;
  const shards: SpineShard[] = [];
  const inBandCount = Math.ceil(count * 0.55);
  let silhouetteCrossingPlaced = false;
  let accentPlaced = 0;

  for (let i = 0; i < count; i++) {
    const p = rng();
    let color: string;
    if (p < 0.7) {
      color = coolPalette[Math.floor(rng() * coolPalette.length)]!;
    } else if (p < 0.9) {
      color = ghostPalette[Math.floor(rng() * ghostPalette.length)]!;
    } else {
      color = accentPalette[Math.floor(rng() * accentPalette.length)]!;
    }

    const inBand = i < inBandCount;
    const offsetY = inBand
      ? (rng() - 0.5) * 2 * membraneBandOffsetY
      : (rng() - 0.5) * 0.5;

    const kind = rng();
    let widthScale = 0.06 + rng() * 0.12;
    let heightScale = 0.2 + rng() * 0.55;
    if (kind < 0.34) {
      // Tall-thin sliver
      widthScale = 0.045 + rng() * 0.07;
      heightScale = 0.44 + rng() * 0.52;
    } else if (kind < 0.68) {
      // Short-wide counterpoint
      widthScale = 0.14 + rng() * 0.14;
      heightScale = 0.12 + rng() * 0.2;
    } else if (kind < 0.86) {
      // Tiny chip
      widthScale = 0.035 + rng() * 0.05;
      heightScale = 0.08 + rng() * 0.14;
    }

    let offsetX: number;
    if (!silhouetteCrossingPlaced && inBand) {
      offsetX = (rng() - 0.5) * 0.3;
      widthScale = Math.max(widthScale, 0.22);
      heightScale = Math.max(heightScale, 0.36);
      silhouetteCrossingPlaced = true;
    } else {
      offsetX = (rng() - 0.5) * 1.18;
    }

    const zOffsetRaw = (rng() - 0.62) * 5.0;
    const zOffset = Math.max(zOffsetMin, Math.min(zOffsetMax, zOffsetRaw));

    const accent = accentPlaced < 2 && p >= 0.9;
    if (accent) accentPlaced += 1;
    shards.push({
      offsetX,
      offsetY,
      heightScale,
      widthScale,
      zOffset,
      opacityScale: accent ? 0.62 + rng() * 0.28 : 0.3 + rng() * 0.46,
      color: accent ? accentColor : color,
      driftPhase: rng() * Math.PI * 2,
      driftScale: 0.4 + rng() * 0.75,
      driftRateScale: 0.72 + rng() * 0.5,
      accent,
    });
  }
  return shards;
}

/**
 * Build spine description from preset (arrays + zStep, planeGap, idle drift) and fixed overrides.
 * Composed by getSceneDescription(). Arrays are source of truth; Spine.tsx consumes scene.spine only.
 */
export function buildSpineDescription(): GLSceneSpine {
  const preset = SPINE_STYLE_PRESET;
  const planeCount = preset.planeCount;
  const shardCountByMode = SPINE_ART_DIRECTION.shards.countsByMode;
  const maxShards = Math.max(
    shardCountByMode.idle,
    shardCountByMode.listening,
    shardCountByMode.processing,
    shardCountByMode.speaking,
  );
  return {
    planeCount,
    envelopeNdc: {
      width: SPINE_ART_DIRECTION.envelope.width,
      height: SPINE_ART_DIRECTION.envelope.height,
      centerY: SPINE_ART_DIRECTION.envelope.centerY,
    },
    style: {
      color: '#b7d2ff',
      opacity: SPINE_ART_DIRECTION.visibility.baseOpacity,
      opacityBoostFromHalftone:
        SPINE_ART_DIRECTION.visibility.opacityBoostFromHalftone,
      halftoneOpacityScale:
        SPINE_ART_DIRECTION.visibility.halftoneOpacityScale,
      shardOpacityScale: SPINE_ART_DIRECTION.visibility.shardOpacityScale,
      halftoneDebugFlat: SPINE_ART_DIRECTION.visibility.halftoneDebugFlat,
      blend: SPINE_ART_DIRECTION.visibility.blend,
      overlayDistance: 10,
      zStep: preset.zStep,
      planeOffsetX: [...preset.planeOffsetX],
      planeWidthScale: [...preset.planeWidthScale],
      planeOpacityScale: [...preset.planeOpacityScale],
      planeGap: preset.planeGap,
      planeOffsetY: [...preset.planeOffsetY],
      planeHeightScale: [...preset.planeHeightScale],
      planeZOffset: [...preset.planeZOffset],
      planeColors: [...preset.planeColors],
      planeRenderOrder: [...preset.planeRenderOrder],
      planeAccent: [...preset.planeAccent],
      halftoneEnabled: preset.halftoneEnabled,
      halftoneFadeMode: preset.halftoneFadeMode,
      halftoneFadeInner: preset.halftoneFadeInner,
      halftoneFadeOuter: preset.halftoneFadeOuter,
      halftoneFadePower: preset.halftoneFadePower,
      driftAmpX: preset.driftAmpX,
      driftAmpY: preset.driftAmpY,
      perPlaneDriftScale: preset.perPlaneDriftScale,
      perPlaneDriftPhaseStep: preset.perPlaneDriftPhaseStep,
      driftHz: preset.driftHz,
      idleBreathAmp: preset.idleBreathAmp,
      idleBreathHz: preset.idleBreathHz,
      processingOverflowBoost:
        SPINE_ART_DIRECTION.motion.processingOverflowBoost,
      processingExtraOverlap: SPINE_ART_DIRECTION.motion.processingExtraOverlap,
      processingHeightBoost: SPINE_ART_DIRECTION.motion.processingHeightBoost,
      processingMotionBoost: SPINE_ART_DIRECTION.motion.processingMotionBoost,
      processingEdgeBoost: SPINE_ART_DIRECTION.motion.processingEdgeBoost,
      shardWidthScale: 0.28,
      edgeBandWidth: 0.22,
      edgeOpacity: 0.34,
    },
    shards: buildSupportShards(42, maxShards),
    shardCountByMode,
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
