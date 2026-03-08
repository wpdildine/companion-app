/**
 * Spine light-core preset: backlight beam behind spine stack.
 * Composed by spineArtDirection.ts; builders read via SPINE_ART_DIRECTION only.
 */

export const SPINE_LIGHT_CORE_PRESET = {
  enabled: true,
  color: '#5ccfff',
  orbColor: '#9b7dff',
  opacityBase: 0.19,
  widthScale: 1.92,
  heightScale: 2.02,
  zOffset: -0.12,
  blend: 'additive' as const,
  orbStrength: 0.72,
  orbRadius: 0.23,
  orbFalloff: 2.1,
  orbCenterY: 0.5,
  orbDebugObvious: false,
  orbDebugMultiplier: 2.5,
  warpAmpX: 0.018,
  warpAmpY: 0.012,
  warpFreq: 0.22,
  warpScaleByMode: {
    idle: 1.1,
    listening: 1.35,
    processing: 1.8,
    speaking: 0.95,
  },
  opacityByMode: {
    idle: 1.05,
    listening: 1.2,
    processing: 1.45,
    speaking: 1.0,
  },
  /** How this layer scales shared modulation channels (render-side). Same flat-preset idiom as warpScaleByMode. */
  modulationWeights: {
    hueShift: 1,
    intensity: 1,
    agitation: 1,
    opacityBias: 1,
  },
  /** Color to lerp toward when hueShift is applied. Layer application only; no event semantics. */
  modulationTintColor: '#ff6b6b',
} as const;
