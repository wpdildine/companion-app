/**
 * Spine light-core preset: backlight beam behind spine stack.
 * Composed by spineArtDirection.ts; builders read via SPINE_ART_DIRECTION only.
 */

export const SPINE_LIGHT_CORE_PRESET = {
  enabled: true,
  color: '#8fd6ff',
  opacityBase: 0.12,
  widthScale: 1.3,
  heightScale: 1.45,
  zOffset: -0.12,
  blend: 'additive' as const,
  warpAmpX: 0.028,
  warpAmpY: 0.016,
  warpFreq: 0.28,
  warpScaleByMode: {
    idle: 1.6,
    listening: 2.0,
    processing: 2.8,
    speaking: 1.4,
  },
  opacityByMode: {
    idle: 0.9,
    listening: 1.05,
    processing: 1.25,
    speaking: 0.95,
  },
} as const;
