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
  zStep: number;
  /** Relative horizontal offsets by plane index (length must equal planeCount). */
  planeOffsetX: number[];
  /** Relative width scale by plane index (length must equal planeCount). */
  planeWidthScale: number[];
  /** Relative opacity multipliers by plane index (length must equal planeCount). */
  planeOpacityScale: number[];
  /** Gap between planes as a fraction of plane height. */
  planeGap: number;
};

export type GLSceneSpine = {
  planeCount: 5;
  envelopeNdc: SpineEnvelopeNdc;
  style: GLSceneSpineStyle;
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
  intensity: 0.065,
  density: 1.0,
};
const HALFTONE_PROCESSING: SpineHalftoneProfile = {
  intensity: 0.3,
  density: 1.75,
};
const HALFTONE_SPEAKING: SpineHalftoneProfile = {
  intensity: 0,
  density: 1.0,
};

/**
 * Build spine description with canonical table defaults. Composed by getSceneDescription().
 */
export function buildSpineDescription(): GLSceneSpine {
  const planeCount = 5 as const;
  return {
    planeCount,
    envelopeNdc: {
      width: 0.12,
      height: 1.86,
      centerY: 0,
    },
    style: {
      color: '#b7d2ff',
      opacity: 0.22,
      blend: 'additive',
      zStep: 0.012,
      planeOffsetX: [-0.018, 0.010, 0.0, -0.008, 0.016],
      planeWidthScale: [0.88, 0.96, 1.06, 0.94, 0.86],
      planeOpacityScale: [0.78, 0.88, 1.0, 0.86, 0.74],
      planeGap: 0.22,
    },
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
