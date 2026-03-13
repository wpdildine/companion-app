/**
 * nameShapingInteractionRouting: precedence and routing rules.
 */

import {
  isCenterHoldEligible,
  shouldForwardToNameShapingCapture,
  shouldEmitClusterReleaseOnEnd,
} from './nameShapingInteractionRouting';

describe('nameShapingInteractionRouting', () => {
  describe('isCenterHoldEligible', () => {
    it('when Name Shaping capture present, uses voice lane from layout', () => {
      expect(isCenterHoldEligible(true, true, null)).toBe(true);
      expect(isCenterHoldEligible(true, false, null)).toBe(false);
      expect(isCenterHoldEligible(true, true, 'rules')).toBe(true);
      expect(isCenterHoldEligible(true, false, 'cards')).toBe(false);
    });

    it('when Name Shaping capture not present, uses zone === null for center', () => {
      expect(isCenterHoldEligible(false, true, null)).toBe(true);
      expect(isCenterHoldEligible(false, false, null)).toBe(true);
      expect(isCenterHoldEligible(false, true, 'rules')).toBe(false);
      expect(isCenterHoldEligible(false, false, 'cards')).toBe(false);
    });
  });

  describe('shouldForwardToNameShapingCapture', () => {
    it('forwards when capture is present', () => {
      expect(shouldForwardToNameShapingCapture(true)).toBe(true);
      expect(shouldForwardToNameShapingCapture(false)).toBe(false);
    });
  });

  describe('shouldEmitClusterReleaseOnEnd', () => {
    it('no cluster release when hold had started', () => {
      expect(shouldEmitClusterReleaseOnEnd(true)).toBe(false);
    });
    it('cluster release when hold had not started', () => {
      expect(shouldEmitClusterReleaseOnEnd(false)).toBe(true);
    });
  });
});
