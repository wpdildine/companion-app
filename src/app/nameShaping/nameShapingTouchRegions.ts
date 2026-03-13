/**
 * Name Shaping: canonical spine-local touch region map for debug capture.
 *
 * Coordinates are interaction-band-local NDC in [-1, 1]:
 * - x = horizontal position inside the active band
 * - y = vertical position inside the active band (top = 1, bottom = -1)
 *
 * The corrected physical model is a single spine-centered vertical strip:
 * - one narrow spine-width capture strip
 * - six selector segments arranged vertically along the spine
 * - one reserved center voice segment inside that same strip
 */

import type { NameShapingSelector } from './nameShapingConstants';

const NDC_MIN = -1;
const NDC_MAX = 1;

/**
 * Match the rendered spine envelope width so the overlay feels like a vertical
 * spine stack instead of screen columns.
 */
export const NAME_SHAPING_SPINE_STRIP_HALF_WIDTH = 0.145;

/**
 * Seven stacked spine-local segments: three above voice, voice, three below.
 */
const SEGMENT_HEIGHT = (NDC_MAX - NDC_MIN) / 7;

export interface NameShapingVerticalSegment {
  selector: NameShapingSelector | null;
  kind: 'selector' | 'voice';
  startNdcY: number;
  endNdcY: number;
}

export interface NameShapingOverlayRegion {
  selector: NameShapingSelector | null;
  kind: 'selector' | 'voice';
  startNdcX: number;
  endNdcX: number;
  startNdcY: number;
  endNdcY: number;
}

export const NAME_SHAPING_VERTICAL_SEGMENTS: readonly NameShapingVerticalSegment[] = [
  { selector: 'BRIGHT', kind: 'selector', startNdcY: 1 - SEGMENT_HEIGHT, endNdcY: 1 },
  { selector: 'ROUND', kind: 'selector', startNdcY: 1 - SEGMENT_HEIGHT * 2, endNdcY: 1 - SEGMENT_HEIGHT },
  { selector: 'LIQUID', kind: 'selector', startNdcY: 1 - SEGMENT_HEIGHT * 3, endNdcY: 1 - SEGMENT_HEIGHT * 2 },
  { selector: null, kind: 'voice', startNdcY: 1 - SEGMENT_HEIGHT * 4, endNdcY: 1 - SEGMENT_HEIGHT * 3 },
  { selector: 'SOFT', kind: 'selector', startNdcY: 1 - SEGMENT_HEIGHT * 5, endNdcY: 1 - SEGMENT_HEIGHT * 4 },
  { selector: 'HARD', kind: 'selector', startNdcY: 1 - SEGMENT_HEIGHT * 6, endNdcY: 1 - SEGMENT_HEIGHT * 5 },
  { selector: 'BREAK', kind: 'selector', startNdcY: -1, endNdcY: 1 - SEGMENT_HEIGHT * 6 },
];

export const NAME_SHAPING_OVERLAY_REGIONS: readonly NameShapingOverlayRegion[] =
  NAME_SHAPING_VERTICAL_SEGMENTS.map(segment => ({
    selector: segment.selector,
    kind: segment.kind,
    startNdcX: -NAME_SHAPING_SPINE_STRIP_HALF_WIDTH,
    endNdcX: NAME_SHAPING_SPINE_STRIP_HALF_WIDTH,
    startNdcY: segment.startNdcY,
    endNdcY: segment.endNdcY,
  }));

function isInsideRange(value: number, start: number, end: number): boolean {
  return value >= start && value <= end;
}

function isInsideSpineStrip(ndcX: number): boolean {
  return isInsideRange(
    ndcX,
    -NAME_SHAPING_SPINE_STRIP_HALF_WIDTH,
    NAME_SHAPING_SPINE_STRIP_HALF_WIDTH,
  );
}

export function isVoiceLaneNdc(ndcX: number, ndcY: number): boolean {
  const voiceSegment = NAME_SHAPING_VERTICAL_SEGMENTS[3];
  return (
    isInsideSpineStrip(ndcX) &&
    isInsideRange(ndcY, voiceSegment.startNdcY, voiceSegment.endNdcY)
  );
}

/**
 * Map interaction-band-local NDC to the active selector in the spine-centered
 * vertical strip. Returns null outside the strip and in the reserved voice
 * segment.
 */
export function getSelectorFromNdc(
  ndcX: number,
  ndcY: number,
): NameShapingSelector | null {
  if (
    ndcX < NDC_MIN ||
    ndcX > NDC_MAX ||
    ndcY < NDC_MIN ||
    ndcY > NDC_MAX
  ) {
    return null;
  }
  if (!isInsideSpineStrip(ndcX)) return null;

  for (let index = 0; index < NAME_SHAPING_VERTICAL_SEGMENTS.length; index += 1) {
    const segment = NAME_SHAPING_VERTICAL_SEGMENTS[index];
    const isLastSegment = index === NAME_SHAPING_VERTICAL_SEGMENTS.length - 1;
    if (ndcY > segment.startNdcY || isLastSegment) {
      return segment.kind === 'voice' ? null : segment.selector;
    }
  }

  return null;
}
