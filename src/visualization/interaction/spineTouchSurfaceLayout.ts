/**
 * Shared physical spine touch surface in band-local NDC.
 * Grammar-agnostic: defines envelope and center strip only. No selector semantics.
 * zoneLayout.ts rules/cards semantics are out of scope; do not absorb them here.
 */

const NDC_MIN = -1;
const NDC_MAX = 1;

/** Band-local NDC envelope: full interactive band. */
export const ENVELOPE_NDC = {
  minX: NDC_MIN,
  maxX: NDC_MAX,
  minY: NDC_MIN,
  maxY: NDC_MAX,
} as const;

/**
 * Half-width of the center spine strip in band-local NDC.
 * Spine-centered; used by grammars (e.g. Name Shaping) that partition the center strip.
 */
export const CENTER_STRIP_HALF_WIDTH = 0.145;

/** Center strip X bounds in band-local NDC. */
export const CENTER_STRIP_NDC = {
  minX: -CENTER_STRIP_HALF_WIDTH,
  maxX: CENTER_STRIP_HALF_WIDTH,
} as const;

export interface SpineTouchSurfaceBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Returns the total interactive envelope in band-local NDC.
 */
export function getEnvelopeBounds(): SpineTouchSurfaceBounds {
  return {
    minX: ENVELOPE_NDC.minX,
    maxX: ENVELOPE_NDC.maxX,
    minY: ENVELOPE_NDC.minY,
    maxY: ENVELOPE_NDC.maxY,
  };
}

/**
 * Returns the center strip bounds (X only; Y spans full envelope).
 * Spine-centered horizontal placement.
 */
export function getCenterStripBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: CENTER_STRIP_NDC.minX,
    maxX: CENTER_STRIP_NDC.maxX,
    minY: ENVELOPE_NDC.minY,
    maxY: ENVELOPE_NDC.maxY,
  };
}

/**
 * True if (ndcX, ndcY) is inside the total interactive envelope.
 */
export function isInsideEnvelope(ndcX: number, ndcY: number): boolean {
  return (
    ndcX >= ENVELOPE_NDC.minX &&
    ndcX <= ENVELOPE_NDC.maxX &&
    ndcY >= ENVELOPE_NDC.minY &&
    ndcY <= ENVELOPE_NDC.maxY
  );
}

/**
 * True if (ndcX, ndcY) is inside the center spine strip (spine-centered).
 */
export function isInsideCenterStrip(ndcX: number, ndcY: number): boolean {
  return (
    ndcX >= CENTER_STRIP_NDC.minX &&
    ndcX <= CENTER_STRIP_NDC.maxX &&
    ndcY >= ENVELOPE_NDC.minY &&
    ndcY <= ENVELOPE_NDC.maxY
  );
}

/**
 * Normalized rect for the center strip in band-local NDC [minX, maxX, minY, maxY].
 */
export function getCenterStripNormalizedRect(): [number, number, number, number] {
  return [
    CENTER_STRIP_NDC.minX,
    CENTER_STRIP_NDC.maxX,
    ENVELOPE_NDC.minY,
    ENVELOPE_NDC.maxY,
  ];
}
