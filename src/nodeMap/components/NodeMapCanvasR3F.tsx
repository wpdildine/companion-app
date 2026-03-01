/**
 * R3F implementation of the node map canvas (constructivist planes + context glyphs).
 * Touch: tap → raypick → pulse; double-tap / long-press / drag callbacks via stubs.
 * canvasBackground and callbacks are injected (no theme import).
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import * as THREE from 'three';
import { ContextGlyphs } from './ContextGlyphs';
import { ContextLinks } from './ContextLinks';
import { EngineLoop } from './EngineLoop';
import { ClusterTouchZones } from './ClusterTouchZones';
import { TouchRaycaster } from '../interaction/TouchRaycaster';
import { CameraOrbit } from './CameraOrbit';
import { PostFXPass } from './PostFXPass';
import type { NodeMapEngineRef } from '../types';
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

export type NodeMapCanvasR3FProps = {
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  canvasBackground?: string;
  clusterZoneHighlights?: boolean;
} & TouchCallbacks;

export function NodeMapCanvasR3F({
  nodeMapRef,
  controlsEnabled,
  inputEnabled,
  canvasBackground = DEFAULT_CANVAS_BACKGROUND,
  clusterZoneHighlights = false,
  onShortTap,
  onDoubleTap,
  onLongPressStart,
  onLongPressEnd,
  onDragStart,
  onDragMove,
  onDragEnd,
}: NodeMapCanvasR3FProps) {
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

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (nodeMapRef.current) {
      nodeMapRef.current.canvasWidth = width;
      nodeMapRef.current.canvasHeight = height;
    }
  };

  const onTouchStart = (e: GestureResponderEvent) => {
    if (!inputEnabled) return;
    const { locationX, locationY } = e.nativeEvent;
    touchStart.current = { x: locationX, y: locationY, t: Date.now() };
    lastMove.current = { x: locationX, y: locationY };
    longPressTriggered.current = false;
    dragActive.current = false;
    if (nodeMapRef.current) {
      const v = nodeMapRef.current;
      const w = v.canvasWidth ?? 1;
      const h = v.canvasHeight ?? 1;
      v.touchFieldActive = true;
      v.touchFieldNdc = [(locationX / w) * 2 - 1, 1 - (locationY / h) * 2];
      v.touchFieldStrength = 1;
      console.log('[NodeMap] touchStart → ref', { touchFieldActive: true, touchFieldNdc: v.touchFieldNdc, canvasSize: [w, h] });
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      touch.onLongPressStart();
    }, LONG_PRESS_MS);
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
    const v = nodeMapRef.current;
    if (v && v.canvasWidth != null && v.canvasHeight != null) {
      v.touchFieldNdc = [(locationX / v.canvasWidth) * 2 - 1, 1 - (locationY / v.canvasHeight) * 2];
      v.touchFieldStrength = 1;
    }
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
    if (nodeMapRef.current) {
      nodeMapRef.current.touchFieldActive = false;
      nodeMapRef.current.touchFieldNdc = null;
      nodeMapRef.current.touchFieldStrength = 0;
      console.log('[NodeMap] touchEnd → ref', { touchFieldActive: false });
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (dragActive.current) {
      dragActive.current = false;
      touch.onDragEnd();
    }
    const v = nodeMapRef.current;
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
  };

  const onCanvasCreated = useCallback(
    (state: { gl: THREE.WebGLRenderer; scene: THREE.Scene }) => {
      const hex = new THREE.Color(canvasBackground).getHex();
      state.gl.setClearColor(hex, 1);
      state.scene.background = new THREE.Color(canvasBackground);
    },
    [canvasBackground],
  );

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
        onCreated={onCanvasCreated}
        gl={{
          alpha: false,
          antialias: true,
          preserveDrawingBuffer: false,
        }}
      >
        <color attach="background" args={[canvasBackground]} />
        <EngineLoop nodeMapRef={nodeMapRef} />
        <TouchRaycaster nodeMapRef={nodeMapRef} />
        <CameraOrbit nodeMapRef={nodeMapRef} />
        <ClusterTouchZones
          nodeMapRef={nodeMapRef}
          highlighted={clusterZoneHighlights}
        />
        <ContextGlyphs nodeMapRef={nodeMapRef} />
        <ContextLinks nodeMapRef={nodeMapRef} />
        <PostFXPass nodeMapRef={nodeMapRef} />
      </Canvas>
    </View>
  );
}
