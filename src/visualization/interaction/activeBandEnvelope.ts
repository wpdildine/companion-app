/**
 * Shared helper for active-band vertical envelope and center-NDC alignment.
 * Single place for (h - bandTopInsetPx)/h and -(bandTopInsetPx/h) so consumers don't drift.
 */

export interface ActiveBandVerticalEnvelope {
  /** Ratio of canvas height that is the active band (below bandTopInsetPx). */
  activeHeightRatio: number;
  /** Center of the inactive top strip in NDC (vertical). */
  centerNdcY: number;
  /** Active band height in pixels. */
  activeHeightPx: number;
  /** Top offset in pixels (bandTopInsetPx). */
  topOffsetPx: number;
}

/**
 * Derive active-band vertical envelope and center-NDC from bandTopInsetPx and canvas height.
 * Use this instead of reimplementing (h - bandTopInsetPx)/h and -(bandTopInsetPx/h).
 */
export function getActiveBandVerticalEnvelope(
  bandTopInsetPx: number,
  heightPx: number,
): ActiveBandVerticalEnvelope {
  const activeHeightPx = Math.max(0, heightPx - bandTopInsetPx);
  const activeHeightRatio =
    heightPx > 0 ? Math.max(0, Math.min(1, activeHeightPx / heightPx)) : 0;
  const centerNdcY = heightPx > 0 ? -(bandTopInsetPx / heightPx) : 0;
  return {
    activeHeightRatio,
    centerNdcY,
    activeHeightPx,
    topOffsetPx: bandTopInsetPx,
  };
}
