/**
 * Touch callback types and stub map. Visualization consumes these; no theme import.
 * If touch begins to alter mode / analytics / haptics, move contract upward (e.g. src/interaction).
 *
 * "Canvas" callbacks below apply when `VisualizationCanvasR3F`'s outer View is touch-targetable.
 * With default `VisualizationSurface` (`pointerEvents="none"` on the canvas wrapper), they are
 * not invoked. Cluster release from touch is normally `InteractionBand` → `onClusterRelease`.
 */

export interface TouchCallbacks {
  /**
   * Discrete short-tap callback from R3F canvas wrapper pointer handling (when touchable).
   *
   * Semantics:
   * - Fires on quick press/release on the canvas surface.
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
   *
   * Not forwarded by `VisualizationSurface` / `VisualizationCanvas` to R3F today; type-wide for compatibility.
   */
  onClusterRelease?: (cluster: 'rules' | 'cards') => void;
  /** Discrete double-tap from R3F canvas wrapper (when touchable). */
  onDoubleTap?: () => void;
  /** Long-press start from R3F canvas wrapper (when touchable). */
  onLongPressStart?: () => void;
  /** Long-press end from R3F canvas wrapper (when touchable). */
  onLongPressEnd?: () => void;
  /** Drag start from R3F canvas wrapper (orbit; when touchable). */
  onDragStart?: () => void;
  /** Drag move delta from R3F canvas wrapper (when touchable). */
  onDragMove?: (dx: number, dy: number) => void;
  /** Drag end from R3F canvas wrapper (when touchable). */
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
