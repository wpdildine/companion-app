import { advanceFallbackVisualState } from './VisualizationCanvasFallback';

describe('advanceFallbackVisualState', () => {
  it('freezes fallback visuals when fallbackInterval is off', () => {
    const prev = { activity: 0.42, tick: 7 };
    expect(advanceFallbackVisualState(prev, 0.95, false)).toEqual(prev);
  });

  it('advances activity and tick when fallbackInterval is on', () => {
    const prev = { activity: 0.2, tick: 3 };
    expect(advanceFallbackVisualState(prev, 1, true)).toEqual({
      activity: 0.32,
      tick: 4,
    });
  });
});
