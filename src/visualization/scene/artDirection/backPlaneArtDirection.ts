/**
 * Art direction for the back plane layer (rear structural slabs behind the spine).
 * Pure data: no render/runtime logic.
 */

export const BACK_PLANE_ART_DIRECTION = {
  /** Number of rear slabs (hero + optional secondary). */
  planeCount: 2,
  /** Opacity for primary (hero) slab. */
  opacityBaseHero: 0.07,
  /** Opacity for secondary slab. */
  opacityBaseSecondary: 0.04,
  /** Scale multiplier for hero plane (view-sized). */
  // Keep these under 1.0 so this layer reads as rear slabs, not a fullscreen wash.
  scaleHero: 0.62,
  scaleSecondary: 0.44,
  /** Drift speed scale (restrained; slower than spine). */
  driftScale: 0.4,
  /** Optional parallax (0 = off). */
  parallaxScale: 0,
} as const;
