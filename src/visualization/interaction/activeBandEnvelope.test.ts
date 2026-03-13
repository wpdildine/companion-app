/**
 * activeBandEnvelope: shared vertical envelope derivation.
 */

import {
  getActiveBandVerticalEnvelope,
} from './activeBandEnvelope';

describe('activeBandEnvelope', () => {
  it('computes activeHeightRatio and centerNdcY from bandTopInsetPx and height', () => {
    const e = getActiveBandVerticalEnvelope(112, 800);
    expect(e.activeHeightPx).toBe(688);
    expect(e.activeHeightRatio).toBeCloseTo(688 / 800, 10);
    expect(e.centerNdcY).toBeCloseTo(-112 / 800, 10);
    expect(e.topOffsetPx).toBe(112);
  });

  it('clamps activeHeightRatio to [0, 1]', () => {
    const e = getActiveBandVerticalEnvelope(900, 800);
    expect(e.activeHeightPx).toBe(0);
    expect(e.activeHeightRatio).toBe(0);
  });

  it('handles zero height without division issues', () => {
    const e = getActiveBandVerticalEnvelope(112, 0);
    expect(e.activeHeightPx).toBe(0);
    expect(e.activeHeightRatio).toBe(0);
    expect(e.centerNdcY).toBe(0);
  });

  it('vertical active-region regression: known inputs produce expected outputs', () => {
    const e = getActiveBandVerticalEnvelope(112, 844);
    expect(e.activeHeightRatio).toBeCloseTo((844 - 112) / 844, 10);
    expect(e.centerNdcY).toBeCloseTo(-112 / 844, 10);
  });
});
