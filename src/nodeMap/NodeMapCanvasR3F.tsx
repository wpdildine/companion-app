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

const TAP_MAX_MS = 2200;
const TAP_MAX_MOVE = 15;
const ORBIT_SENSITIVITY = 0.008;

export function NodeMapCanvasR3F({
  vizRef,
  controlsEnabled,
  inputEnabled,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
}) {
  const touchStart = useRef({ x: 0, y: 0, t: 0 });
  const lastMove = useRef({ x: 0, y: 0 });

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
    console.log('[NodeMap] touchStart', { locationX, locationY });
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    if (!inputEnabled) return;
    if (!controlsEnabled) return;
    const v = vizRef.current;
    if (!v) return;
    const { locationX, locationY } = e.nativeEvent;
    const dx = (locationX - lastMove.current.x) * ORBIT_SENSITIVITY;
    const dy = (locationY - lastMove.current.y) * ORBIT_SENSITIVITY;
    v.orbitTheta -= dx;
    v.orbitPhi = Math.max(0.1, Math.min(Math.PI - 0.1, v.orbitPhi + dy));
    lastMove.current = { x: locationX, y: locationY };
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (!inputEnabled) return;
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
    if (dt < TAP_MAX_MS && dist < TAP_MAX_MOVE) {
      const ndcX = (locationX / v.canvasWidth) * 2 - 1;
      const ndcY = 1 - (locationY / v.canvasHeight) * 2;
      v.pendingTapNdc = [ndcX, ndcY];
      console.log('[NodeMap] touchEnd: registered as tap, pendingTapNdc=', [ndcX, ndcY]);
    } else {
      console.log('[NodeMap] touchEnd: not a tap (dt or dist too large)');
    }
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
      onTouchStart={inputEnabled ? onTouchStart : undefined}
      onTouchMove={inputEnabled && controlsEnabled ? onTouchMove : undefined}
      onTouchEnd={inputEnabled ? onTouchEnd : undefined}
    >
      <Canvas
        style={StyleSheet.absoluteFill}
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
