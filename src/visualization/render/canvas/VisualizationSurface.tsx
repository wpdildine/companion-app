/**
 * Wrapper that layers the GL canvas behind content. Canvas uses absolute fill;
 * content (e.g. ScrollView) is rendered above and receives touches.
 * Use for seamless layering: canvas = animated field, UI = readable panels on top.
 *
 * Touch policy (default app shell): the canvas wrapper uses `pointerEvents="none"`, so the
 * GL subtree does not receive touches. Discrete `TouchCallbacks` (short tap, long press,
 * drag, etc.) are for latent / direct-mount use when consumers mount `VisualizationCanvas` or
 * `VisualizationCanvasR3F` without blocking pointer events—here they are dormant.
 *
 * `TouchCallbacks` includes `onClusterRelease`, but this component does not destructure or
 * forward it to `VisualizationCanvas` (live cluster release is `InteractionBand` in AgentSurface).
 *
 * This surface passes `canvasTouchPolicy="none"` so the R3F wrapper does not attach direct-mount
 * touch handlers. Optional {@link TouchCallbacks} remain on the public props type for
 * direct-mount / API compatibility; shell apps (e.g. `AgentSurface`) omit them.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { TouchCallbacks } from '../../interaction/touchHandlers';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';
import { VisualizationCanvas } from './VisualizationCanvas';

/**
 * Props extend `TouchCallbacks` for API compatibility; `onClusterRelease` is not forwarded
 * to the canvas child (see file comment). Prefer wiring cluster release on `InteractionBand`.
 * Optional direct-mount gesture props match `DirectMountCanvasTouchCallbacks` in `touchHandlers.ts`.
 */
export type VisualizationSurfaceProps = {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  canvasBackground?: string;
  clusterZoneHighlights?: boolean;
  children: React.ReactNode;
} & TouchCallbacks;

export function VisualizationSurface({
  visualizationRef,
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
}: VisualizationSurfaceProps) {
  return (
    <View style={styles.root}>
      <View style={styles.canvas} pointerEvents="none">
        <VisualizationCanvas
          visualizationRef={visualizationRef}
          controlsEnabled={controlsEnabled}
          inputEnabled={inputEnabled}
          canvasBackground={canvasBackground}
          clusterZoneHighlights={clusterZoneHighlights}
          canvasTouchPolicy="none"
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
    borderWidth: 0,
    borderColor: '#00d4ff',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
  },
});
