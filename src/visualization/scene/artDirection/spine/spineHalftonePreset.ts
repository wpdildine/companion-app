/**
 * Spine halftone preset: density/intensity, fade mode, gradient masks.
 * Composed by spineArtDirection.ts; do not import from render/build.
 */

export const SPINE_HALFTONE_PRESET = {
  halftoneProfiles: {
    idle: { intensity: 0.48, density: 1.6 },
    listening: { intensity: 0.66, density: 1.6 },
    processing: { intensity: 0.9, density: 1.6 },
    speaking: { intensity: 0.36, density: 1.6 },
  },
} as const;
