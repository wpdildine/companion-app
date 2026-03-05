/**
 * Spine shard preset: countsByMode, palettes, z ranges, banding rules.
 * Composed by spineArtDirection.ts; do not import from render/build.
 */

export const SPINE_SHARD_PRESET = {
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
