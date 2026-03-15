import {
  toBandNdc,
  toFullScreenNdc,
  getZoneFromNdcX,
  hasMovedBeyondThreshold,
  NEUTRAL_HALF_WIDTH_NDC,
} from '../fastMath';

describe('fastMath', () => {
  describe('toFullScreenNdc', () => {
    it('converts top-left to [-1, 1]', () => {
      expect(toFullScreenNdc(0, 0, 100, 100)).toEqual([-1, 1]);
    });
    it('converts center to [0, 0]', () => {
      expect(toFullScreenNdc(50, 50, 100, 100)).toEqual([0, 0]);
    });
  });

  describe('toBandNdc', () => {
    it('converts top-left of active region to [-1, 1]', () => {
      // With 20px inset, Y=20 is the "top" of the band
      const result = toBandNdc(0, 20, 100, 120, 20);
      expect(result).toEqual([-1, 1]);
    });

    it('converts bottom-right to [1, -1]', () => {
      // With 20px inset, Y=120 is the "bottom"
      const result = toBandNdc(100, 120, 100, 120, 20);
      expect(result).toEqual([1, -1]);
    });

    it('handles negative or zero layout', () => {
      expect(toBandNdc(50, 50, 0, 100, 0)).toBeNull();
      expect(toBandNdc(50, 50, 100, 20, 20)).toBeNull(); // bandH = 0
    });
  });

  describe('getZoneFromNdcX', () => {
    it('classifies rules (left)', () => {
      expect(getZoneFromNdcX(-0.5)).toBe('rules');
    });

    it('classifies cards (right)', () => {
      expect(getZoneFromNdcX(0.5)).toBe('cards');
    });

    it('classifies center (null)', () => {
      expect(getZoneFromNdcX(0)).toBeNull();
      // Boundaries
      expect(getZoneFromNdcX(-NEUTRAL_HALF_WIDTH_NDC + 0.01)).toBeNull();
      expect(getZoneFromNdcX(NEUTRAL_HALF_WIDTH_NDC - 0.01)).toBeNull();
    });
  });

  describe('hasMovedBeyondThreshold', () => {
    it('returns true if distance > maxMove', () => {
      expect(hasMovedBeyondThreshold(0, 0, 10, 0, 5)).toBe(true);
      expect(hasMovedBeyondThreshold(0, 0, 8, 8, 10)).toBe(true); // hypot ~11.3
    });

    it('returns false if distance <= maxMove', () => {
      expect(hasMovedBeyondThreshold(0, 0, 4, 0, 5)).toBe(false);
      expect(hasMovedBeyondThreshold(0, 0, 6, 8, 10)).toBe(false);
    });
  });
});
