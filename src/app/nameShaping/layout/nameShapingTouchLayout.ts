/**
 * Name Shaping mode-specific layout over the shared spine touch surface.
 * Partitions the center strip into 7 total regions (middle = voice, other 6 = selectors).
 * Consumes spineTouchSurfaceLayout from visualization; does not own physical surface.
 */

import {
  CENTER_STRIP_NDC,
  ENVELOPE_NDC,
  getCenterStripBounds,
} from '../../../visualization/interaction/spineTouchSurfaceLayout';
import type { NameShapingSelector } from '../foundation/nameShapingConstants';

const NDC_MIN = -1;
const NDC_MAX = 1;

/** 7 regions total: 3 above voice, voice, 3 below. Voice is index 3. */
const REGION_COUNT = 7;
const SEGMENT_HEIGHT = (NDC_MAX - NDC_MIN) / REGION_COUNT;

export type NameShapingRegionKind = 'selector' | 'voice';

export interface NameShapingLayoutRegion {
  id: string;
  selector: NameShapingSelector | null;
  kind: NameShapingRegionKind;
  startNdcX: number;
  endNdcX: number;
  startNdcY: number;
  endNdcY: number;
}

/** Ordering top-to-bottom: BRIGHT, ROUND, LIQUID, voice, SOFT, HARD, BREAK. */
const REGION_ORDER: ReadonlyArray<{ selector: NameShapingSelector | null; kind: NameShapingRegionKind }> = [
  { selector: 'BRIGHT', kind: 'selector' },
  { selector: 'ROUND', kind: 'selector' },
  { selector: 'LIQUID', kind: 'selector' },
  { selector: null, kind: 'voice' },
  { selector: 'SOFT', kind: 'selector' },
  { selector: 'HARD', kind: 'selector' },
  { selector: 'BREAK', kind: 'selector' },
];

const strip = getCenterStripBounds();

/**
 * Name Shaping layout: 7 regions over the shared center strip.
 * Voice lane is one of the seven (index 3). Stable ordering for overlay/capture/debug.
 */
export const NAME_SHAPING_LAYOUT_REGIONS: readonly NameShapingLayoutRegion[] = (
  REGION_ORDER.map((item, index) => {
    const startNdcY = NDC_MAX - SEGMENT_HEIGHT * (index + 1);
    const endNdcY = NDC_MAX - SEGMENT_HEIGHT * index;
    return {
      id: item.kind === 'voice' ? 'voice' : (item.selector as string),
      selector: item.selector,
      kind: item.kind,
      startNdcX: strip.minX,
      endNdcX: strip.maxX,
      startNdcY,
      endNdcY,
    };
  }) as NameShapingLayoutRegion[]
);

/** Index of the voice region (one of the seven). */
export const VOICE_REGION_INDEX = 3;

/**
 * Returns the voice region (metadata-driven; do not infer from y-order elsewhere).
 */
export function getVoiceRegion(): NameShapingLayoutRegion {
  return NAME_SHAPING_LAYOUT_REGIONS[VOICE_REGION_INDEX];
}

/**
 * True if all layout regions are within the shared center strip X bounds.
 */
export function regionsWithinCenterStrip(): boolean {
  return NAME_SHAPING_LAYOUT_REGIONS.every(
    r => r.startNdcX >= CENTER_STRIP_NDC.minX && r.endNdcX <= CENTER_STRIP_NDC.maxX,
  );
}

/**
 * True if all layout regions are within the shared envelope Y bounds.
 */
export function regionsWithinEnvelope(): boolean {
  return NAME_SHAPING_LAYOUT_REGIONS.every(
    r =>
      r.startNdcY >= ENVELOPE_NDC.minY &&
      r.endNdcY <= ENVELOPE_NDC.maxY,
  );
}
