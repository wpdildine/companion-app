/**
 * Touch handlers: withTouchStubs returns all callbacks, stubs when missing.
 */

import { withTouchStubs } from '../src/viz/interaction/touchHandlers';

describe('withTouchStubs', () => {
  it('returns all callback keys', () => {
    const cbs = withTouchStubs({});
    expect(cbs.onShortTap).toBeDefined();
    expect(typeof cbs.onShortTap).toBe('function');
    expect(cbs.onDoubleTap).toBeDefined();
    expect(cbs.onLongPressStart).toBeDefined();
    expect(cbs.onLongPressEnd).toBeDefined();
    expect(cbs.onDragStart).toBeDefined();
    expect(cbs.onDragMove).toBeDefined();
    expect(cbs.onDragEnd).toBeDefined();
  });

  it('uses provided callback when given', () => {
    const fn = jest.fn();
    const cbs = withTouchStubs({ onShortTap: fn });
    cbs.onShortTap();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses stub when not provided', () => {
    const cbs = withTouchStubs({});
    expect(() => cbs.onShortTap()).not.toThrow();
    expect(() => cbs.onDragMove(10, 20)).not.toThrow();
  });
});
