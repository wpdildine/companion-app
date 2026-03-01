/**
 * Wrapper that layers the GL canvas behind content. Canvas uses absolute fill;
 * content (e.g. ScrollView) is rendered above and receives touches.
 * Use for seamless layering: canvas = animated field, UI = readable panels on top.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NodeMapCanvas } from './NodeMapCanvas';
import type { NodeMapEngineRef } from '../types';
import type { TouchCallbacks } from '../interaction/touchHandlers';

export type NodeMapSurfaceProps = {
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  canvasBackground?: string;
  clusterZoneHighlights?: boolean;
  children: React.ReactNode;
} & TouchCallbacks;

export function NodeMapSurface({
  nodeMapRef,
  controlsEnabled,
  inputEnabled,
  canvasBackground,
  clusterZoneHighlights = false,
  children,
  onShortTap,
  onClusterTap,
  onDoubleTap,
  onLongPressStart,
  onLongPressEnd,
  onDragStart,
  onDragMove,
  onDragEnd,
}: NodeMapSurfaceProps) {
  return (
    <View style={styles.root}>
      <View style={styles.canvas} pointerEvents="none">
        <NodeMapCanvas
          nodeMapRef={nodeMapRef}
          controlsEnabled={controlsEnabled}
          inputEnabled={inputEnabled}
          canvasBackground={canvasBackground}
          clusterZoneHighlights={clusterZoneHighlights}
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
    borderWidth: 6,
    borderColor: '#00d4ff',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
  },
});
