/**
 * Spine rot preset: rotational layer knobs (plane count by mode, rotation range,
 * scale variance, colors/opacity, which plane gets halftone).
 * Composed by spineArtDirection.ts; builders read via SPINE_ART_DIRECTION only.
 */

export const SPINE_ROT_PRESET = {
  /** Plane count per canonical mode (idle 2–4, listening 3–5, processing 4–6, speaking 2–3). */
  planeCountByMode: {
    idle: 4,
    listening: 5,
    processing: 6,
    speaking: 3,
  },
  /** Rotation range in degrees (small: ±6° to ±14°). */
  rotationDegMin: -12,
  rotationDegMax: 12,
  /** Scale ranges (overlay-local units) so rotated planes are visibly compositional. */
  scaleXMin: 0.68,
  scaleXMax: 1.46,
  scaleYMin: 0.78,
  scaleYMax: 2.05,
  /** Base opacity for rot layer ghost planes (target visual range ~0.06–0.18 after scale). */
  opacityBase: 0.2,
  /** Index of plane that gets halftone accent (or -1 for none). At most one. */
  halftoneAccentPlaneIndex: 1,
  /** Colors for rot planes (reuse spine accent logic; no new palette). */
  planeColors: ['#c6e8ff', '#b8e0ff', '#a8d7ff', '#d0eeff', '#b0dbff', '#c2e6ff'],
  /** Local overlay Z range (near camera, top structural layer; still below debug overlay by renderOrder). */
  zMin: 0.08,
  zMax: 0.46,
} as const;
