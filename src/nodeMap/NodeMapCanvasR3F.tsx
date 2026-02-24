/**
 * R3F implementation of the node map (Lane A).
 * Loaded only when @react-three/fiber/native + expo-gl are available.
 * Touch: tap → raypick → pulse at 3D point; drag → orbit camera (reference behavior).
 */

import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { StarfieldPoints } from './StarfieldPoints';
import { NodeCloudPoints } from './NodeCloudPoints';
import { EngineLoop } from './EngineLoop';
import { TouchRaycaster } from './TouchRaycaster';
import { CameraOrbit } from './CameraOrbit';
import { PostFXPass } from './PostFXPass';
import type { VizEngineRef } from './types';

const TAP_MAX_MS = 300;
const TAP_MAX_MOVE = 15;
const LONG_PRESS_MS = 500;
const LONG_PRESS_CANCEL_MOVE = 18;
const ORBIT_SENSITIVITY = 0.008;

export function NodeMapCanvasR3F({
  vizRef,
  controlsEnabled,
  inputEnabled,
  onShortTap,
  onLongPressStart,
  onLongPressEnd,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  onShortTap?: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
}) {
  const fill = StyleSheet.absoluteFillObject;
  const touchStart = useRef({ x: 0, y: 0, t: 0 });
  const lastMove = useRef({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  useEffect(() => {
    console.log('[NodeMap] R3F Canvas mounted', Platform.OS);
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    console.log('[NodeMap] onLayout', { width, height });
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
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (onLongPressStart) {
      longPressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;
        onLongPressStart();
      }, LONG_PRESS_MS);
    }
    console.log('[NodeMap] touchStart', { locationX, locationY });
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
    if (!v) return;
    if (!controlsEnabled) {
      lastMove.current = { x: locationX, y: locationY };
      return;
    }
    const dx = (locationX - lastMove.current.x) * ORBIT_SENSITIVITY;
    const dy = (locationY - lastMove.current.y) * ORBIT_SENSITIVITY;
    v.orbitTheta -= dx;
    v.orbitPhi = Math.max(0.1, Math.min(Math.PI - 0.1, v.orbitPhi + dy));
    lastMove.current = { x: locationX, y: locationY };
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (!inputEnabled) return;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    const v = vizRef.current;
    const { locationX, locationY } = e.nativeEvent;
    const dt = Date.now() - touchStart.current.t;
    const dist = Math.hypot(
      locationX - touchStart.current.x,
      locationY - touchStart.current.y,
    );
    console.log('[NodeMap] touchEnd', {
      locationX,
      locationY,
      dt,
      dist,
      canvasSize: v ? [v.canvasWidth, v.canvasHeight] : null,
    });
    if (!v || v.canvasWidth <= 0 || v.canvasHeight <= 0) {
      console.log('[NodeMap] touchEnd: skip (no vizRef or zero canvas size)');
      return;
    }
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      onLongPressEnd?.();
      console.log('[NodeMap] touchEnd: long press completed');
      return;
    }
    if (dt < TAP_MAX_MS && dist < TAP_MAX_MOVE) {
      const ndcX = (locationX / v.canvasWidth) * 2 - 1;
      const ndcY = 1 - (locationY / v.canvasHeight) * 2;
      v.pendingTapNdc = [ndcX, ndcY];
      onShortTap?.();
      console.log('[NodeMap] touchEnd: registered as tap, pendingTapNdc=', [ndcX, ndcY]);
    } else {
      console.log('[NodeMap] touchEnd: not a tap (dt or dist too large)');
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
        <color attach="background" args={['#0a0612']} />
        <EngineLoop vizRef={vizRef} />
        <TouchRaycaster vizRef={vizRef} />
        <CameraOrbit vizRef={vizRef} />
        <StarfieldPoints vizRef={vizRef} />
        <NodeCloudPoints vizRef={vizRef} />
        <PostFXPass vizRef={vizRef} />
      </Canvas>
    </View>
  );
}
