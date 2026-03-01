/**
 * Wrapper that layers the GL canvas behind content. Canvas uses absolute fill;
 * content (e.g. ScrollView) is rendered above and receives touches.
 * Use for seamless layering: canvas = animated field, UI = readable panels on top.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { VizCanvas } from './VizCanvas';
import type { VizEngineRef } from '../types';
import type { TouchCallbacks } from '../interaction/touchHandlers';

export type VizSurfaceProps = {
  vizRef: React.RefObject<VizEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  canvasBackground?: string;
  children: React.ReactNode;
} & TouchCallbacks;

export function VizSurface({
  vizRef,
  controlsEnabled,
  inputEnabled,
  canvasBackground,
  children,
  onShortTap,
  onClusterTap,
  onDoubleTap,
  onLongPressStart,
  onLongPressEnd,
  onDragStart,
  onDragMove,
  onDragEnd,
}: VizSurfaceProps) {
  return (
    <View style={styles.root}>
      <View style={styles.canvas} pointerEvents="none">
        <VizCanvas
          vizRef={vizRef}
        controlsEnabled={controlsEnabled}
        inputEnabled={inputEnabled}
        canvasBackground={canvasBackground}
        onShortTap={onShortTap}
        onClusterTap={onClusterTap}
        onDoubleTap={onDoubleTap}
        onLongPressStart={onLongPressStart}
        onLongPressEnd={onLongPressEnd}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        />
      </View>
      <View style={styles.content} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
  },
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    ...StyleSheet.absoluteFillObject,
  },
});
