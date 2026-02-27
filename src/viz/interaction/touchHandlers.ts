/**
 * Touch callback types and stub map. NodeMap consumes these; no theme import.
 * If touch begins to alter mode / analytics / haptics, move contract upward (e.g. src/interaction).
 */

export interface TouchCallbacks {
  onShortTap?: () => void;
  onDoubleTap?: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  onDragStart?: () => void;
  onDragMove?: (dx: number, dy: number) => void;
  onDragEnd?: () => void;
}

const noop = () => {};
const noopDrag = (_dx: number, _dy: number) => {};

/**
 * Returns a full set of callbacks, using stubs for any missing handler.
 * Callers can pass only the handlers they need; the rest are no-ops.
 */
export function withTouchStubs(callbacks: TouchCallbacks = {}): Required<TouchCallbacks> {
  return {
    onShortTap: callbacks.onShortTap ?? noop,
    onDoubleTap: callbacks.onDoubleTap ?? noop,
    onLongPressStart: callbacks.onLongPressStart ?? noop,
    onLongPressEnd: callbacks.onLongPressEnd ?? noop,
    onDragStart: callbacks.onDragStart ?? noop,
    onDragMove: callbacks.onDragMove ?? noopDrag,
    onDragEnd: callbacks.onDragEnd ?? noop,
  };
}
