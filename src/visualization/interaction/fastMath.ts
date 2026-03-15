/**
 * Pure workletizable functions for interaction band math.
 * Keeping this completely separate from UI components for testability
 * and ensuring we re-implement the exact constraints of InteractionBand natively.
 */

/** Half-width of the center neutral strip in NDC, matching zoneLayout.ts */
export const NEUTRAL_HALF_WIDTH_NDC = 0.12;

/**
 * Converts screen coordinates to full-screen NDC (no inset offset).
 * @param locationX Touch X coordinate
 * @param locationY Touch Y coordinate
 * @param fullW Width of the screen
 * @param fullH Height of the screen
 */
export function toFullScreenNdc(
  locationX: number,
  locationY: number,
  fullW: number,
  fullH: number,
): [number, number] | null {
  'worklet';
  if (fullW <= 0 || fullH <= 0) return null;
  const ndcX = (locationX / fullW) * 2 - 1;
  const ndcY = 1 - (locationY / fullH) * 2;
  return [ndcX, ndcY];
}

/**
 * Converts screen coordinates into canonical active-region NDC.
 * Takes the full screen layout but applies the logical inset to simulate the old physical band.
 * @param locationX Full-screen Touch X
 * @param locationY Full-screen Touch Y
 * @param fullW Width of the full screen
 * @param fullH Height of the full screen
 * @param topInsetPx The logical inset where the active region begins
 */
export function toBandNdc(
  locationX: number,
  locationY: number,
  fullW: number,
  fullH: number,
  topInsetPx: number,
): [number, number] | null {
  'worklet';
  const bandH = fullH - topInsetPx;
  if (fullW <= 0 || bandH <= 0) return null;
  const localY = locationY - topInsetPx;
  const ndcX = (locationX / fullW) * 2 - 1;
  const ndcY = 1 - (localY / bandH) * 2;
  return [ndcX, ndcY];
}

/**
 * Classifies the active-region NDC X coordinate into Semantic Zones.
 * Replicates getZoneFromNdcX from zoneLayout.ts.
 */
export function getZoneFromNdcX(ndcX: number): 'rules' | 'cards' | null {
  'worklet';
  if (ndcX < -NEUTRAL_HALF_WIDTH_NDC) return 'rules';
  if (ndcX > NEUTRAL_HALF_WIDTH_NDC) return 'cards';
  return null;
}

/**
 * Validates if the touch has moved beyond the cancel threshold for center holds.
 * @param startX Initial touch X
 * @param startY Initial touch Y
 * @param currentX Current touch X
 * @param currentY Current touch Y
 * @param maxMovePx Cancel threshold (12px in InteractionBand)
 */
export function hasMovedBeyondThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  maxMovePx: number,
): boolean {
  'worklet';
  const dx = currentX - startX;
  const dy = currentY - startY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist > maxMovePx;
}
