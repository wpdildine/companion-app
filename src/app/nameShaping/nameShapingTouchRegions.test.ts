/**
 * getSelectorFromNdc: spine-centered vertical strip map for touch-to-selector capture.
 */

import {
  getSelectorFromNdc,
  isVoiceLaneNdc,
  NAME_SHAPING_OVERLAY_REGIONS,
  NAME_SHAPING_VERTICAL_SEGMENTS,
} from './nameShapingTouchRegions';

describe('getSelectorFromNdc', () => {
  it('returns null when touch is outside the active band range', () => {
    expect(getSelectorFromNdc(-1.001, 0)).toBeNull();
    expect(getSelectorFromNdc(0, 1.001)).toBeNull();
  });

  it('returns null when touch is outside the spine strip', () => {
    expect(getSelectorFromNdc(0.4, 0.9)).toBeNull();
    expect(getSelectorFromNdc(-0.5, -0.5)).toBeNull();
  });

  it('returns null in the reserved center voice segment', () => {
    expect(isVoiceLaneNdc(0, 0)).toBe(true);
    expect(getSelectorFromNdc(0, 0)).toBeNull();
    expect(getSelectorFromNdc(0.08, 0)).toBeNull();
  });

  it('maps top-to-bottom vertical spine segments to selectors', () => {
    expect(getSelectorFromNdc(0, 0.9)).toBe('BRIGHT');
    expect(getSelectorFromNdc(0.08, 0.55)).toBe('ROUND');
    expect(getSelectorFromNdc(-0.08, 0.25)).toBe('LIQUID');
    expect(getSelectorFromNdc(0, -0.25)).toBe('SOFT');
    expect(getSelectorFromNdc(0.08, -0.55)).toBe('HARD');
    expect(getSelectorFromNdc(-0.08, -0.9)).toBe('BREAK');
  });

  it('exports canonical vertical segments and overlay regions for debug alignment', () => {
    expect(NAME_SHAPING_VERTICAL_SEGMENTS).toHaveLength(7);
    expect(NAME_SHAPING_VERTICAL_SEGMENTS.map(segment => segment.selector)).toEqual([
      'BRIGHT',
      'ROUND',
      'LIQUID',
      null,
      'SOFT',
      'HARD',
      'BREAK',
    ]);
    expect(NAME_SHAPING_OVERLAY_REGIONS).toHaveLength(7);
    expect(NAME_SHAPING_OVERLAY_REGIONS[3]).toMatchObject({
      selector: null,
      kind: 'voice',
    });
  });
});
