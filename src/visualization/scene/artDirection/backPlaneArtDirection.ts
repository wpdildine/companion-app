/**
 * Art direction for the back plane layer (rear structural slabs behind the spine).
 * Pure data: no render/runtime logic.
 */

export const BACK_PLANE_ART_DIRECTION = {
  /** Number of rear slabs (hero + optional secondary). */
  planeCount: 2,
  /** Opacity for primary (hero) slab. */
  opacityBaseHero: 0.12,
  /** Opacity for secondary slab. */
  opacityBaseSecondary: 0.07,
  /** Scale multiplier for hero plane (view-sized). */
  scaleHero: 1.35,
  scaleSecondary: 1.5,
  /** Drift speed scale (restrained; slower than spine). */
  driftScale: 0.4,
  /** Optional parallax (0 = off). */
  parallaxScale: 0,
} as const;
