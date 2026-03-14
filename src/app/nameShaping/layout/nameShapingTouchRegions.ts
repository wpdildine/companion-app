/**
 * Name Shaping: semantic interpreter over the Name Shaping layout.
 * Maps band-local NDC points to region/selector/voice using layout metadata only.
 * Does not own layout constants; consumes nameShapingTouchLayout.
 */

import type { NameShapingSelector } from '../foundation/nameShapingConstants';
import { isInsideCenterStrip } from '../../../visualization/interaction/spineTouchSurfaceLayout';
import {
  getVoiceRegion,
  NAME_SHAPING_LAYOUT_REGIONS,
  type NameShapingLayoutRegion,
} from '../layout/nameShapingTouchLayout';

const NDC_MIN = -1;
const NDC_MAX = 1;

/** Legacy type for overlay/debug consumers; derived from layout. */
export interface NameShapingVerticalSegment {
  selector: NameShapingSelector | null;
  kind: 'selector' | 'voice';
  startNdcY: number;
  endNdcY: number;
}

/** Legacy type for overlay/debug consumers; derived from layout. */
export interface NameShapingOverlayRegion {
  selector: NameShapingSelector | null;
  kind: 'selector' | 'voice';
  startNdcX: number;
  endNdcX: number;
  startNdcY: number;
  endNdcY: number;
}

/** Derived from layout for backward compatibility. Do not use for new logic; use NAME_SHAPING_LAYOUT_REGIONS. */
export const NAME_SHAPING_VERTICAL_SEGMENTS: readonly NameShapingVerticalSegment[] =
  NAME_SHAPING_LAYOUT_REGIONS.map(r => ({
    selector: r.selector,
    kind: r.kind,
    startNdcY: r.startNdcY,
    endNdcY: r.endNdcY,
  }));

/** Derived from layout for overlay/TouchZones. Same 7 regions, stable order. */
export const NAME_SHAPING_OVERLAY_REGIONS: readonly NameShapingOverlayRegion[] =
  NAME_SHAPING_LAYOUT_REGIONS.map(r => ({
    selector: r.selector,
    kind: r.kind,
    startNdcX: r.startNdcX,
    endNdcX: r.endNdcX,
    startNdcY: r.startNdcY,
    endNdcY: r.endNdcY,
  }));

function isInsideRange(value: number, start: number, end: number): boolean {
  return value >= start && value <= end;
}

/**
 * Returns the matching Name Shaping layout region for a band-local NDC point.
 * Membership is exact: if the point is not inside a defined region, returns null.
 */
export function getNameShapingRegionAtNdc(
  ndcX: number,
  ndcY: number,
  regions: readonly NameShapingLayoutRegion[] = NAME_SHAPING_LAYOUT_REGIONS,
): NameShapingLayoutRegion | null {
  if (
    ndcX < NDC_MIN ||
    ndcX > NDC_MAX ||
    ndcY < NDC_MIN ||
    ndcY > NDC_MAX
  ) {
    return null;
  }
  if (!isInsideCenterStrip(ndcX, ndcY)) return null;

  for (const region of regions) {
    const inX = isInsideRange(ndcX, region.startNdcX, region.endNdcX);
    const inY = isInsideRange(ndcY, region.startNdcY, region.endNdcY);
    if (inX && inY) {
      return region;
    }
  }

  return null;
}

/**
 * True if (ndcX, ndcY) is inside the voice region. Uses layout metadata (voice region), not y-order.
 */
export function isVoiceLaneNdc(ndcX: number, ndcY: number): boolean {
  const region = getNameShapingRegionAtNdc(ndcX, ndcY);
  if (!region) return false;
  const voiceRegion = getVoiceRegion();
  return region.id === voiceRegion.id && region.kind === 'voice';
}

/**
 * Map band-local NDC to the active selector. Uses layout region metadata (selector/kind), not y-order.
 * Returns null outside the center strip and in the voice region.
 */
export function getSelectorFromNdc(
  ndcX: number,
  ndcY: number,
): NameShapingSelector | null {
  const region = getNameShapingRegionAtNdc(ndcX, ndcY);
  if (!region || region.kind === 'voice') return null;
  return region.selector;
}
