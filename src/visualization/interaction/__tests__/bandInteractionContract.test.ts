import { isBandClusterSide } from '../bandInteractionContract';

describe('bandInteractionContract', () => {
  describe('isBandClusterSide', () => {
    it('is true for rules and cards', () => {
      expect(isBandClusterSide('rules')).toBe(true);
      expect(isBandClusterSide('cards')).toBe(true);
    });

    it('is false for center neutral', () => {
      expect(isBandClusterSide(null)).toBe(false);
    });
  });
});
