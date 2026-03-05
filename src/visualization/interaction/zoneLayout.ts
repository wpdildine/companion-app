/**
 * Single source of truth for touch zone NDC boundaries (interaction mapping constant).
 *
 * Invariant: NDC for zone classification MUST be active-region NDC (from InteractionBand's
 * toNdc(bandRect, canvasSize)), not raw screen NDC (e.g. touchX/screenWidth). Using screen NDC
 * would shift the band and break tap alignment.
 */

/** Half-width of the center neutral strip in NDC. Rules: x < -t; neutral: |x| <= t; cards: x > t. */
export const NEUTRAL_HALF_WIDTH_NDC = 0.12;

export type TouchZone = 'rules' | 'cards' | null;

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
