/**
 * Touch callback types and stub map. Visualization consumes these; no theme import.
 * If touch begins to alter mode / analytics / haptics, move contract upward (e.g. src/interaction).
 */

export interface TouchCallbacks {
  /**
   * Discrete short-tap callback from canvas pointer handling.
   *
   * Semantics:
   * - Fires on quick press/release in the canvas surface.
   * - Does NOT carry cluster side semantics.
   * - Typically paired with pendingTapNdc -> TouchRaycaster -> pulse.
   */
  onShortTap?: () => void;
  /**
   * @deprecated Use onClusterRelease for interaction-band semantic commit.
   * Legacy alias retained for compatibility with older callsites.
   *
   * Semantics:
   * - Should be treated as "release commit left/right".
   * - New callsites should prefer onClusterRelease naming.
   */
  onClusterTap?: (cluster: 'rules' | 'cards') => void;
  /**
   * Semantic commit from touch release in InteractionBand:
   * - release left => rules
   * - release right => cards
   * - release center => no callback
   */
  onClusterRelease?: (cluster: 'rules' | 'cards') => void;
  /** Discrete canvas double-tap callback (no cluster semantics). */
  onDoubleTap?: () => void;
  /** Long-press start from canvas gesture path. */
  onLongPressStart?: () => void;
  /** Long-press end from canvas gesture path. */
  onLongPressEnd?: () => void;
  /** Drag start from canvas gesture path (camera/orbit style interaction). */
  onDragStart?: () => void;
  /** Drag move delta from canvas gesture path. */
  onDragMove?: (dx: number, dy: number) => void;
  /** Drag end from canvas gesture path. */
  onDragEnd?: () => void;
}

const noop = () => {};
const noopCluster = (_cluster: 'rules' | 'cards') => {};
const noopDrag = (_dx: number, _dy: number) => {};

/**
 * Returns a full set of callbacks, using stubs for any missing handler.
 * Callers can pass only the handlers they need; the rest are no-ops.
 */
export function withTouchStubs(callbacks: TouchCallbacks = {}): Required<TouchCallbacks> {
  return {
    onShortTap: callbacks.onShortTap ?? noop,
    onClusterTap: callbacks.onClusterTap ?? noopCluster,
    onClusterRelease: callbacks.onClusterRelease ?? noopCluster,
    onDoubleTap: callbacks.onDoubleTap ?? noop,
    onLongPressStart: callbacks.onLongPressStart ?? noop,
    onLongPressEnd: callbacks.onLongPressEnd ?? noop,
    onDragStart: callbacks.onDragStart ?? noop,
    onDragMove: callbacks.onDragMove ?? noopDrag,
    onDragEnd: callbacks.onDragEnd ?? noop,
  };
}
