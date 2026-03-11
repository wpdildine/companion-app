/**
 * R3F implementation of the visualization canvas (constructivist planes + context glyphs).
 *
 * Touch ownership model:
 * - Canvas path handles discrete gestures (short tap, double tap, long press, drag).
 * - InteractionBand handles continuous organism field + semantic cluster release commit.
 *
 * Important split:
 * - Short tap here => pendingTapNdc -> TouchRaycaster pulse only.
 * - Cluster semantics (rules/cards) are release-driven in InteractionBand, not here.
 *
 * This file must never write touchField* (owned by InteractionBand).
 * canvasBackground and callbacks are injected (no theme import).
 */

import { Canvas } from '@react-three/fiber/native';
import React, { useCallback, useRef } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';
import {
  withTouchStubs,
  type TouchCallbacks,
} from '../../interaction/touchHandlers';
import { TouchRaycaster } from '../../interaction/TouchRaycaster';
import type { VisualizationEngineRef } from '../../engine/types';
import { CameraOrbit } from './CameraOrbit';
import { ContextGlyphs } from '../layers/ContextGlyphs';
import { ContextLinks } from '../layers/ContextLinks';
import { BackPlaneLayer } from '../layers/BackPlaneLayer';
import { BackgroundLayer } from '../layers/BackgroundLayer';
import { Spine } from '../layers/Spine';
import { SpineLightCoreLayer } from '../layers/SpineLightCoreLayer';
import { SpineRotLayer } from '../layers/SpineRotLayer';
import { TouchZones } from '../layers/TouchZones';
import { EngineLoop } from '../../engine/EngineLoop';
import { PostFXPass } from './PostFXPass';

const TAP_MAX_MS = 300;
const TAP_MAX_MOVE = 15;
const LONG_PRESS_MS = 500;
const LONG_PRESS_CANCEL_MOVE = 18;
const ORBIT_SENSITIVITY = 0.008;
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_MAX_MOVE = 30;
const DRAG_THRESHOLD = 8;

const DEFAULT_CANVAS_BACKGROUND = '#0a0612';

export type VisualizationCanvasR3FProps = {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  canvasBackground?: string;
  clusterZoneHighlights?: boolean;
} & TouchCallbacks;

export function VisualizationCanvasR3F({
  visualizationRef,
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
}: VisualizationCanvasR3FProps) {
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
    if (visualizationRef.current) {
      visualizationRef.current.canvasWidth = width;
      visualizationRef.current.canvasHeight = height;
    }
  };

  const onTouchStart = (e: GestureResponderEvent) => {
    if (!inputEnabled) return;
    const { locationX, locationY } = e.nativeEvent;
    touchStart.current = { x: locationX, y: locationY, t: Date.now() };
    lastMove.current = { x: locationX, y: locationY };
    longPressTriggered.current = false;
    dragActive.current = false;
    // InteractionBand owns touchField*; canvas path is discrete gestures only.
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
    // Keep canvas move logic scoped to local drag/orbit behavior only.
    // touchField* remains owned by InteractionBand.
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
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (!inputEnabled) return;
    // InteractionBand clears touchField*; canvas end handles only local gesture completion.
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
      // Discrete tap path:
      // 1) Convert to screen NDC
      // 2) Write pendingTapNdc
      // 3) TouchRaycaster consumes pendingTapNdc and emits pulse in world space
      //
      // This path intentionally does not decide rules/cards semantics.
      const ndcX = (locationX / v.canvasWidth) * 2 - 1;
      const ndcY = 1 - (locationY / v.canvasHeight) * 2;
      const now = Date.now();
      const prev = lastTap.current;
      const isDoubleTap =
        prev &&
        now - prev.t <= DOUBLE_TAP_MS &&
        Math.hypot(locationX - prev.x, locationY - prev.y) <=
          DOUBLE_TAP_MAX_MOVE;
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
      const gl = state.gl;
      const hex = new THREE.Color(canvasBackground).getHex();
      gl.setClearColor(hex, 1);
      state.scene.background = new THREE.Color(canvasBackground);
      gl.toneMapping = THREE.NoToneMapping;
      if ('outputColorSpace' in gl) (gl as THREE.WebGLRenderer).outputColorSpace = THREE.SRGBColorSpace;
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
        <BackgroundLayer visualizationRef={visualizationRef} />
        <BackPlaneLayer visualizationRef={visualizationRef} />
        <SpineLightCoreLayer visualizationRef={visualizationRef} />
        <Spine visualizationRef={visualizationRef}>
          <SpineRotLayer visualizationRef={visualizationRef} />
        </Spine>
        <EngineLoop visualizationRef={visualizationRef} />
        <TouchRaycaster visualizationRef={visualizationRef} />
        <CameraOrbit visualizationRef={visualizationRef} />
        <ContextLinks visualizationRef={visualizationRef} />
        <ContextGlyphs visualizationRef={visualizationRef} />
        <TouchZones visualizationRef={visualizationRef} />
        <PostFXPass visualizationRef={visualizationRef} />
      </Canvas>
    </View>
  );
}
