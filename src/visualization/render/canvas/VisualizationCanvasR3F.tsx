/**
 * R3F implementation of the visualization canvas (constructivist planes + context glyphs).
 *
 * Touch (when `canvasTouchPolicy === 'full'` and the outer `View` receives touches):
 * - Discrete gestures via `useDirectMountCanvasTouchHandlers`: short tap → `pendingTapNdc` +
 *   TouchRaycaster pulse, double tap, long press, drag/orbit. Must never write touchField*
 *   (owned by InteractionBand).
 *
 * Default `VisualizationSurface` passes `canvasTouchPolicy="none"` and `pointerEvents="none"` on
 * the canvas layer — no direct-mount handlers; band-region input is `InteractionBand` only.
 *
 * Cluster release (rules/cards) is driven by InteractionBand, not this file.
 * canvasBackground and callbacks are injected (no theme import).
 */

import { Canvas } from '@react-three/fiber/native';
import React, { useCallback, useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';
import type { TouchCallbacks } from '../../interaction/touchHandlers';
import { TouchRaycaster } from '../../interaction/TouchRaycaster';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';
import { subscribeVisualizationScene } from '../../runtime/applySceneUpdates';
import { CameraOrbit } from './CameraOrbit';
import {
  useDirectMountCanvasTouchHandlers,
  type CanvasTouchPolicy,
} from './directMountCanvasTouch';
import {
  LAYER_REGISTRY,
  DEFAULT_LAYER_DESCRIPTORS,
  isMountIdInRegistry,
} from '../layers/layerRegistry';
import { RuntimeLoop } from '../../runtime/RuntimeLoop';
import { PostFXPass } from './PostFXPass';

const DEFAULT_CANVAS_BACKGROUND = '#0a0612';

export type VisualizationCanvasR3FProps = {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  canvasBackground?: string;
  clusterZoneHighlights?: boolean;
  /**
   * `none`: shell / non-interactive GL wrapper — no RN touch handlers (default for
   * `VisualizationSurface`). `full`: direct-mount canvas gestures (tap, long-press, orbit).
   */
  canvasTouchPolicy?: CanvasTouchPolicy;
} & TouchCallbacks;

export function VisualizationCanvasR3F({
  visualizationRef,
  controlsEnabled,
  inputEnabled,
  canvasBackground = DEFAULT_CANVAS_BACKGROUND,
  canvasTouchPolicy = 'full',
  onShortTap,
  onDoubleTap,
  onLongPressStart,
  onLongPressEnd,
  onDragStart,
  onDragMove,
  onDragEnd,
}: VisualizationCanvasR3FProps) {
  const [, setSceneRevision] = useState(0);

  useEffect(() => {
    return subscribeVisualizationScene(visualizationRef, () => {
      setSceneRevision(revision => revision + 1);
    });
  }, [visualizationRef]);

  const touchHandlers = useDirectMountCanvasTouchHandlers({
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
  });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (visualizationRef.current) {
      visualizationRef.current.canvasWidth = width;
      visualizationRef.current.canvasHeight = height;
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

  const fill = StyleSheet.absoluteFillObject;

  return (
    <View
      style={fill}
      onLayout={onLayout}
      onTouchStart={inputEnabled ? touchHandlers.onTouchStart : undefined}
      onTouchMove={inputEnabled ? touchHandlers.onTouchMove : undefined}
      onTouchEnd={inputEnabled ? touchHandlers.onTouchEnd : undefined}
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
        {(visualizationRef.current?.scene?.layerDescriptors ??
          DEFAULT_LAYER_DESCRIPTORS)
          .filter(
            d => d.enabled !== false && isMountIdInRegistry(d.id),
          )
          .map(d => {
            const Comp = LAYER_REGISTRY[d.id];
            return Comp ? (
              <Comp
                key={d.id}
                visualizationRef={visualizationRef}
                descriptor={d}
              />
            ) : null;
          })}
        <RuntimeLoop visualizationRef={visualizationRef} />
        <TouchRaycaster visualizationRef={visualizationRef} />
        <CameraOrbit visualizationRef={visualizationRef} />
        <PostFXPass visualizationRef={visualizationRef} />
      </Canvas>
    </View>
  );
}
