/**
 * Single source of truth for touch zone NDC boundaries (interaction mapping constant).
 *
 * Invariant: NDC for zone classification MUST be active-region NDC (from InteractionBand's
 * toNdc(bandRect, canvasSize)), not raw screen NDC (e.g. touchX/screenWidth). Using screen NDC
 * would shift the band and break tap alignment.
 */

/** Half-width of the center neutral strip in NDC. Rules: x < -t; neutral: |x| <= t; cards: x > t. */
export const NEUTRAL_HALF_WIDTH_NDC = 0.12;

/**
 * NDC X range for focusBias: at ndcX = ±FOCUS_RANGE_NDC we get focusBias = ±1 (when presence is 1).
 * Single canonical constant for organism focus bias; do not duplicate.
 */
export const FOCUS_RANGE_NDC = 0.5;
/** Max beam lean offset in NDC used by organism-response math (matches light-core lean tuning). */
export const BEAM_LEAN_MAX_NDC = 0.05;

/**
 * Smoothing: exponential decay toward target. Same style as touchInfluence in RuntimeLoop.
 * Tune TOUCH_PRESENCE_LAMBDA so release decays over ~200–600 ms (e.g. 4–8 at 60fps).
 */
export const TOUCH_PRESENCE_LAMBDA = 6;
/** Smoothing for NDC to reduce finger jitter. */
export const TOUCH_NDC_LAMBDA = 12;

export type TouchZone = 'rules' | 'cards' | null;

/**
 * Canonical focusBias formula (single place). Use this everywhere; do not reimplement.
 * focusBias in [-1, 1]: -1 = rules side, 0 = neutral, +1 = cards side.
 */
function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Beam-relative focus bias:
 * - Direction from (touchX - beamCenterX)
 * - Magnitude ramps outside neutral strip and eases with smoothstep
 * - Scaled by touch presence
 */
export function computeFocusBias(
  ndcX: number,
  touchPresence: number,
  beamCenterNdcX: number = 0,
): number {
  if (touchPresence <= 0) return 0;
  const relX = ndcX - beamCenterNdcX;
  const absRel = Math.abs(relX);
  const dir = relX < 0 ? -1 : relX > 0 ? 1 : 0;
  const magLinear = Math.max(
    0,
    Math.min(1, (absRel - NEUTRAL_HALF_WIDTH_NDC) / FOCUS_RANGE_NDC),
  );
  const mag = smoothstep01(magLinear);
  return dir * mag * touchPresence;
}

/**
 * Classify zone from active-region NDC X only.
 * @param ndcX - X in active-region NDC (from toNdc).
 * @param neutralHalfWidth - Defaults to NEUTRAL_HALF_WIDTH_NDC.
 */
export function getZoneFromNdcX(
  ndcX: number,
  neutralHalfWidth: number = NEUTRAL_HALF_WIDTH_NDC,
): TouchZone {
  if (ndcX < -neutralHalfWidth) return 'rules';
  if (ndcX > neutralHalfWidth) return 'cards';
  return null;
}
