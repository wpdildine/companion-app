/**
 * R3F implementation of the viz canvas (constructivist planes + context glyphs).
 * Touch: tap → raypick → pulse; double-tap / long-press / drag callbacks via stubs.
 * canvasBackground and callbacks are injected (no theme import).
 */

import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { ContextGlyphs } from './ContextGlyphs';
import { ContextLinks } from './ContextLinks';
import { EngineLoop } from './EngineLoop';
import { TouchRaycaster } from '../interaction/TouchRaycaster';
import { CameraOrbit } from './CameraOrbit';
import { PostFXPass } from './PostFXPass';
import type { VizEngineRef } from '../types';
import { withTouchStubs, type TouchCallbacks } from '../interaction/touchHandlers';

const TAP_MAX_MS = 300;
const TAP_MAX_MOVE = 15;
const LONG_PRESS_MS = 500;
const LONG_PRESS_CANCEL_MOVE = 18;
const ORBIT_SENSITIVITY = 0.008;
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_MAX_MOVE = 30;
const DRAG_THRESHOLD = 8;

const DEFAULT_CANVAS_BACKGROUND = '#0a0612';

export type VizCanvasR3FProps = {
  vizRef: React.RefObject<VizEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  canvasBackground?: string;
} & TouchCallbacks;

export function VizCanvasR3F({
  vizRef,
  controlsEnabled,
  inputEnabled,
  canvasBackground = DEFAULT_CANVAS_BACKGROUND,
  onShortTap,
  onDoubleTap,
  onLongPressStart,
  onLongPressEnd,
  onDragStart,
  onDragMove,
  onDragEnd,
}: VizCanvasR3FProps) {
  const touch = withTouchStubs({
    onShortTap,
    onDoubleTap,
    onLongPressStart,
    onLongPressEnd,
    onDragStart,
    onDragMove,
    onDragEnd,
  });
  const fill = StyleSheet.absoluteFillObject;
  const touchStart = useRef({ x: 0, y: 0, t: 0 });
  const lastMove = useRef({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const dragActive = useRef(false);

  useEffect(() => {
    console.log('[Viz] R3F Canvas mounted', Platform.OS);
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    console.log('[Viz] onLayout', { width, height });
    if (vizRef.current) {
      vizRef.current.canvasWidth = width;
      vizRef.current.canvasHeight = height;
    }
  };

  const onTouchStart = (e: GestureResponderEvent) => {
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
    console.log('[Viz] touchStart', { locationX, locationY });
  };

  const onTouchMove = (e: GestureResponderEvent) => {
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
    const v = vizRef.current;
    const dx = (locationX - lastMove.current.x) * ORBIT_SENSITIVITY;
    const dy = (locationY - lastMove.current.y) * ORBIT_SENSITIVITY;
    if (v && controlsEnabled && moved > DRAG_THRESHOLD) {
      if (!dragActive.current) {
        dragActive.current = true;
        touch.onDragStart();
      }
      touch.onDragMove(locationX - lastMove.current.x, locationY - lastMove.current.y);
      v.orbitTheta -= dx;
      v.orbitPhi = Math.max(0.1, Math.min(Math.PI - 0.1, v.orbitPhi + dy));
    }
    lastMove.current = { x: locationX, y: locationY };
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (!inputEnabled) return;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (dragActive.current) {
      dragActive.current = false;
      touch.onDragEnd();
    }
    const v = vizRef.current;
    const { locationX, locationY } = e.nativeEvent;
    const dt = Date.now() - touchStart.current.t;
    const dist = Math.hypot(
      locationX - touchStart.current.x,
      locationY - touchStart.current.y,
    );
    console.log('[Viz] touchEnd', {
      locationX,
      locationY,
      dt,
      dist,
      canvasSize: v ? [v.canvasWidth, v.canvasHeight] : null,
    });
    if (!v || v.canvasWidth <= 0 || v.canvasHeight <= 0) {
      console.log('[Viz] touchEnd: skip (no vizRef or zero canvas size)');
      return;
    }
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      touch.onLongPressEnd();
      console.log('[Viz] touchEnd: long press completed');
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
        console.log('[Viz] touchEnd: double tap');
      } else {
        lastTap.current = { x: locationX, y: locationY, t: now };
        v.pendingTapNdc = [ndcX, ndcY];
        touch.onShortTap();
        console.log('[Viz] touchEnd: tap, pendingTapNdc=', [ndcX, ndcY]);
      }
    } else {
      console.log('[Viz] touchEnd: not a tap (dt or dist too large)');
    }
  };

  return (
    <View
      style={fill}
      onLayout={onLayout}
      onTouchStart={inputEnabled ? onTouchStart : undefined}
      onTouchMove={inputEnabled ? onTouchMove : undefined}
      onTouchEnd={inputEnabled ? onTouchEnd : undefined}
    >
      <Canvas
        style={fill}
        camera={{ position: [0, 0, 12], fov: 60 }}
        gl={{ alpha: true, antialias: true }}
      >
        <color attach="background" args={[canvasBackground]} />
        <EngineLoop vizRef={vizRef} />
        <TouchRaycaster vizRef={vizRef} />
        <CameraOrbit vizRef={vizRef} />
        <ContextGlyphs vizRef={vizRef} />
        <ContextLinks vizRef={vizRef} />
        <PostFXPass vizRef={vizRef} />
      </Canvas>
    </View>
  );
}
