/**
 * Direct-mount canvas touch handling for `VisualizationCanvasR3F` when the outer `View` is
 * touch-targetable (`canvasTouchPolicy: 'full'`). Does not write `touchField*` (owned by
 * `InteractionBand`).
 */

import { useCallback, useMemo, useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { withTouchStubs, type TouchCallbacks } from '../../interaction/touchHandlers';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';

const TAP_MAX_MS = 300;
const TAP_MAX_MOVE = 15;
const LONG_PRESS_MS = 500;
const LONG_PRESS_CANCEL_MOVE = 18;
const ORBIT_SENSITIVITY = 0.008;
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_MAX_MOVE = 30;
const DRAG_THRESHOLD = 8;

export type CanvasTouchPolicy = 'none' | 'full';

export type DirectMountCanvasTouchParams = {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  inputEnabled: boolean;
  controlsEnabled: boolean;
  canvasTouchPolicy: CanvasTouchPolicy;
} & Pick<
  TouchCallbacks,
  | 'onShortTap'
  | 'onDoubleTap'
  | 'onLongPressStart'
  | 'onLongPressEnd'
  | 'onDragStart'
  | 'onDragMove'
  | 'onDragEnd'
>;

/**
 * Returns optional RN touch handlers for the R3F wrapper `View`. When policy is `none`,
 * handlers are omitted so no work runs for shell-mounted canvases.
 */
export function useDirectMountCanvasTouchHandlers({
  visualizationRef,
  inputEnabled,
  controlsEnabled,
  canvasTouchPolicy,
  onShortTap,
  onDoubleTap,
  onLongPressStart,
  onLongPressEnd,
  onDragStart,
  onDragMove,
  onDragEnd,
}: DirectMountCanvasTouchParams): {
  onTouchStart?: (e: GestureResponderEvent) => void;
  onTouchMove?: (e: GestureResponderEvent) => void;
  onTouchEnd?: (e: GestureResponderEvent) => void;
} {
  const touch = useMemo(
    () =>
      withTouchStubs({
        onShortTap,
        onDoubleTap,
        onLongPressStart,
        onLongPressEnd,
        onDragStart,
        onDragMove,
        onDragEnd,
      }),
    [
      onShortTap,
      onDoubleTap,
      onLongPressStart,
      onLongPressEnd,
      onDragStart,
      onDragMove,
      onDragEnd,
    ],
  );

  const touchStart = useRef({ x: 0, y: 0, t: 0 });
  const lastMove = useRef({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const dragActive = useRef(false);

  const onTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      if (!inputEnabled) return;
      const { locationX, locationY } = e.nativeEvent;
      touchStart.current = { x: locationX, y: locationY, t: Date.now() };
      lastMove.current = { x: locationX, y: locationY };
      longPressTriggered.current = false;
      dragActive.current = false;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      longPressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;
        touch.onLongPressStart();
      }, LONG_PRESS_MS);
    },
    [inputEnabled, touch],
  );

  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!inputEnabled) return;
      const { locationX, locationY } = e.nativeEvent;
      const moved = Math.hypot(
        locationX - touchStart.current.x,
        locationY - touchStart.current.y,
      );
      if (moved > LONG_PRESS_CANCEL_MOVE && longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      const v = visualizationRef.current;
      const dx = (locationX - lastMove.current.x) * ORBIT_SENSITIVITY;
      const dy = (locationY - lastMove.current.y) * ORBIT_SENSITIVITY;
      if (v && controlsEnabled && moved > DRAG_THRESHOLD) {
        if (!dragActive.current) {
          dragActive.current = true;
          touch.onDragStart();
        }
        touch.onDragMove(
          locationX - lastMove.current.x,
          locationY - lastMove.current.y,
        );
        v.orbitTheta -= dx;
        v.orbitPhi = Math.max(0.1, Math.min(Math.PI - 0.1, v.orbitPhi + dy));
      }
      lastMove.current = { x: locationX, y: locationY };
    },
    [inputEnabled, controlsEnabled, visualizationRef, touch],
  );

  const onTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      if (!inputEnabled) return;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (dragActive.current) {
        dragActive.current = false;
        touch.onDragEnd();
      }
      const v = visualizationRef.current;
      const { locationX, locationY } = e.nativeEvent;
      const dt = Date.now() - touchStart.current.t;
      const dist = Math.hypot(
        locationX - touchStart.current.x,
        locationY - touchStart.current.y,
      );
      if (!v || v.canvasWidth <= 0 || v.canvasHeight <= 0) return;
      if (longPressTriggered.current) {
        longPressTriggered.current = false;
        touch.onLongPressEnd();
        return;
      }
      if (dt < TAP_MAX_MS && dist < TAP_MAX_MOVE) {
        const ndcX = (locationX / v.canvasWidth) * 2 - 1;
        const ndcY = 1 - (locationY / v.canvasHeight) * 2;
        const now = Date.now();
        const prev = lastTap.current;
        const isDoubleTap =
          prev &&
          now - prev.t <= DOUBLE_TAP_MS &&
          Math.hypot(locationX - prev.x, locationY - prev.y) <= DOUBLE_TAP_MAX_MOVE;
        if (isDoubleTap) {
          lastTap.current = null;
          touch.onDoubleTap();
        } else {
          lastTap.current = { x: locationX, y: locationY, t: now };
          v.pendingTapNdc = [ndcX, ndcY];
          touch.onShortTap();
        }
      }
    },
    [inputEnabled, visualizationRef, touch],
  );

  if (canvasTouchPolicy === 'none') {
    return {};
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
