/**
 * Spine shard preset: countsByMode, palettes, z ranges, banding rules.
 * Composed by spineArtDirection.ts; do not import from render/build.
 */

export const SPINE_SHARD_PRESET = {
  shards: {
    countsByMode: {
      idle: 10,
      listening: 14,
      processing: 18,
      speaking: 10,
    },
    zOffsetMin: -0.8,
    zOffsetMax: 0.8,
    membraneBandOffsetY: 0.28,
    coolPalette: ['#3e6da8', '#447fc2', '#56a2e7', '#355e93'],
    ghostPalette: ['#1a2a42', '#18263c', '#21324d'],
    accentPalette: ['#68e6ff', '#9df4ff'],
    accentColor: '#8defff',
  },
} as const;
