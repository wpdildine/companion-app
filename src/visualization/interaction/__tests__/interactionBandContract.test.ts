/**
 * Focused tests for InteractionBand semantic contract: zone resolution,
 * hold-cancel threshold, and release → cluster mapping. Uses zoneLayout and
 * fastMath (same as band); does not render the band.
 */

import { getZoneFromNdcX, NEUTRAL_HALF_WIDTH_NDC } from '../zoneLayout';
import { hasMovedBeyondThreshold } from '../fastMath';

const CENTER_HOLD_MOVE_CANCEL_PX = 12;

describe('InteractionBand contract', () => {
  describe('zone resolution (getZoneFromNdcX)', () => {
    it('returns rules for ndcX < -NEUTRAL_HALF_WIDTH_NDC', () => {
      expect(getZoneFromNdcX(-0.2)).toBe('rules');
      expect(getZoneFromNdcX(-NEUTRAL_HALF_WIDTH_NDC - 0.01)).toBe('rules');
    });

    it('returns cards for ndcX > NEUTRAL_HALF_WIDTH_NDC', () => {
      expect(getZoneFromNdcX(0.2)).toBe('cards');
      expect(getZoneFromNdcX(NEUTRAL_HALF_WIDTH_NDC + 0.01)).toBe('cards');
    });

    it('returns null for center (|ndcX| <= NEUTRAL_HALF_WIDTH_NDC)', () => {
      expect(getZoneFromNdcX(0)).toBeNull();
      expect(getZoneFromNdcX(-NEUTRAL_HALF_WIDTH_NDC)).toBeNull();
      expect(getZoneFromNdcX(NEUTRAL_HALF_WIDTH_NDC)).toBeNull();
      expect(getZoneFromNdcX(-NEUTRAL_HALF_WIDTH_NDC + 0.01)).toBeNull();
      expect(getZoneFromNdcX(NEUTRAL_HALF_WIDTH_NDC - 0.01)).toBeNull();
    });
  });

  describe('release → cluster callback mapping', () => {
    it('rules zone maps to rules cluster', () => {
      const zone = getZoneFromNdcX(-0.5);
      expect(zone).toBe('rules');
    });

    it('cards zone maps to cards cluster', () => {
      const zone = getZoneFromNdcX(0.5);
      expect(zone).toBe('cards');
    });

    it('center zone maps to no cluster (null)', () => {
      const zone = getZoneFromNdcX(0);
      expect(zone).toBeNull();
    });
  });

  describe('hold cancellation (hasMovedBeyondThreshold)', () => {
    it('move beyond CENTER_HOLD_MOVE_CANCEL_PX cancels pending hold', () => {
      // Distance must be > maxMovePx (strict)
      expect(
        hasMovedBeyondThreshold(
          0,
          0,
          CENTER_HOLD_MOVE_CANCEL_PX + 1,
          0,
          CENTER_HOLD_MOVE_CANCEL_PX,
        ),
      ).toBe(true);
      expect(
        hasMovedBeyondThreshold(
          10,
          10,
          10 + CENTER_HOLD_MOVE_CANCEL_PX + 1,
          10,
          CENTER_HOLD_MOVE_CANCEL_PX,
        ),
      ).toBe(true);
    });

    it('move within threshold does not cancel', () => {
      expect(
        hasMovedBeyondThreshold(
          0,
          0,
          CENTER_HOLD_MOVE_CANCEL_PX - 1,
          0,
          CENTER_HOLD_MOVE_CANCEL_PX,
        ),
      ).toBe(false);
      expect(
        hasMovedBeyondThreshold(0, 0, 0, 0, CENTER_HOLD_MOVE_CANCEL_PX),
      ).toBe(false);
    });
  });
});
