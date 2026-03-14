/**
 * Projects canonical band-local layout into overlay and render/debug coordinate spaces.
 * Consumes precomputed active-band envelope only; does not own bandTopInsetPx or inset logic.
 */

/** Precomputed active-band envelope (caller derives from bandTopInsetPx + canvas dimensions). */
export interface ActiveBandEnvelope {
  widthPx: number;
  activeHeightPx: number;
  topOffsetPx: number;
}

/** NDC region bounds (band-local [-1, 1]). */
export interface NdcRegionBounds {
  startNdcX: number;
  endNdcX: number;
  startNdcY: number;
  endNdcY: number;
}

/** Screen rect in pixels. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Map a band-local NDC region to screen pixel rect.
 * Uses precomputed envelope only; does not take bandTopInsetPx.
 */
export function ndcRegionToScreenRect(
  region: NdcRegionBounds,
  envelope: ActiveBandEnvelope,
): ScreenRect {
  const { widthPx, activeHeightPx, topOffsetPx } = envelope;
  const left = (region.startNdcX + 1) * 0.5 * widthPx;
  const right = (region.endNdcX + 1) * 0.5 * widthPx;
  const top = topOffsetPx + (1 - region.endNdcY) * 0.5 * activeHeightPx;
  const bottom = topOffsetPx + (1 - region.startNdcY) * 0.5 * activeHeightPx;
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Map band-local NDC point to screen coordinates (for overlay).
 */
export function ndcToScreen(
  ndcX: number,
  ndcY: number,
  envelope: ActiveBandEnvelope,
): { xPx: number; yPx: number } {
  const xPx = (ndcX + 1) * 0.5 * envelope.widthPx;
  const yPx = envelope.topOffsetPx + (1 - ndcY) * 0.5 * envelope.activeHeightPx;
  return { xPx, yPx };
}

/** Descriptor for render/debug mesh placement (e.g. TouchZones). */
export interface RenderRegionDescriptor {
  centerNdcX: number;
  centerNdcY: number;
  widthRatio: number;
  heightRatio: number;
}

/**
 * Convert NDC region bounds to a render descriptor (center + ratios).
 * Consumes layout only; envelope math is upstream.
 */
export function ndcRegionToRenderDescriptor(region: NdcRegionBounds): RenderRegionDescriptor {
  const centerNdcX = (region.startNdcX + region.endNdcX) * 0.5;
  const centerNdcY = (region.startNdcY + region.endNdcY) * 0.5;
  const widthRatio = (region.endNdcX - region.startNdcX) * 0.5;
  const heightRatio = (region.endNdcY - region.startNdcY) * 0.5;
  return {
    centerNdcX,
    centerNdcY,
    widthRatio,
    heightRatio,
  };
}
