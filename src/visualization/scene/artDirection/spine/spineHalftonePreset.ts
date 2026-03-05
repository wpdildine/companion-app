/**
 * Spine halftone preset: density/intensity, fade mode, gradient masks.
 * Composed by spineArtDirection.ts; do not import from render/build.
 */

export const SPINE_HALFTONE_PRESET = {
  halftoneProfiles: {
    idle: { intensity: 0.46, density: 2.2 },
    listening: { intensity: 0.64, density: 2.2 },
    processing: { intensity: 0.94, density: 2.35 },
    speaking: { intensity: 0.4, density: 2.0 },
  },
} as const;
