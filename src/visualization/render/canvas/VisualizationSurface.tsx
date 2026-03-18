/**
 * Wrapper that layers the GL canvas behind content. Canvas uses absolute fill;
 * content (e.g. ScrollView) is rendered above and receives touches.
 * Use for seamless layering: canvas = animated field, UI = readable panels on top.
 */

import React, { useLayoutEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  DIAG_FREEZE_VISUALIZATION_RUNTIME_UPDATES,
  DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE,
  VISUALIZATION_RUNTIME_LAYERS,
  buildR3fVizIsolationGates,
  effectiveFallbackIntervalEnabled,
  effectiveSignalApplyEnabled,
} from '../../../app/ui/components/overlays/responseRenderBisectFlags';
import { perfTrace } from '../../../shared/logging';
import type { TouchCallbacks } from '../../interaction/touchHandlers';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';
import { VisualizationCanvas } from './VisualizationCanvas';

export type VisualizationSurfaceProps = {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  canvasBackground?: string;
  clusterZoneHighlights?: boolean;
  children: React.ReactNode;
  /** Bisect: omit R3F/GL/RuntimeLoop/fallback tick; host + content layer unchanged. */
  disableVisualizationRuntimeContent?: boolean;
  /** Bisect: keep canvas + touch; skip per-frame runtime in R3F/fallback. */
  freezeVisualizationRuntimeUpdates?: boolean;
  runtimeBisectRequestId?: number | undefined;
  runtimeBisectLifecycle?: string;
} & TouchCallbacks;

export function VisualizationSurface({
  visualizationRef,
  controlsEnabled,
  inputEnabled,
  canvasBackground,
  clusterZoneHighlights = false,
  children,
  disableVisualizationRuntimeContent = false,
  freezeVisualizationRuntimeUpdates = false,
  runtimeBisectRequestId,
  runtimeBisectLifecycle,
  onShortTap,
  onClusterTap,
  onDoubleTap,
  onLongPressStart,
  onLongPressEnd,
  onDragStart,
  onDragMove,
  onDragEnd,
}: VisualizationSurfaceProps) {
  const runtimeContentSkipLoggedRef = useRef(false);
  const disableRuntime = disableVisualizationRuntimeContent === true;
  const freezeProp = freezeVisualizationRuntimeUpdates === true;

  useLayoutEffect(() => {
    const v = visualizationRef.current;
    if (v) {
      v.bisectRequestId = runtimeBisectRequestId;
      v.bisectLifecycle = runtimeBisectLifecycle;
      v.bisectFreezeRuntimeUpdates = freezeProp;
    }
  }, [
    visualizationRef,
    runtimeBisectRequestId,
    runtimeBisectLifecycle,
    freezeProp,
  ]);

  useLayoutEffect(() => {
    const r3f = buildR3fVizIsolationGates(freezeProp);
    for (const layer of VISUALIZATION_RUNTIME_LAYERS) {
      let enabled: boolean;
      if (layer === 'signal_apply') {
        enabled = effectiveSignalApplyEnabled(freezeProp);
      } else if (layer === 'fallback_interval') {
        enabled = effectiveFallbackIntervalEnabled(freezeProp);
      } else {
        enabled = r3f[layer];
      }
      perfTrace('Runtime', 'visualization layer decision', {
        requestId: runtimeBisectRequestId,
        lifecycle: runtimeBisectLifecycle ?? null,
        layer,
        isolationMode: DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE,
        enabled,
        freezeVisualizationRuntimeUpdates:
          freezeProp || DIAG_FREEZE_VISUALIZATION_RUNTIME_UPDATES,
        source: 'visualization_surface_snapshot',
      });
    }
  }, [
    freezeProp,
    runtimeBisectRequestId,
    runtimeBisectLifecycle,
  ]);

  useLayoutEffect(() => {
    perfTrace('Runtime', 'visualization runtime content decision', {
      requestId: runtimeBisectRequestId,
      lifecycle: runtimeBisectLifecycle ?? null,
      disableVisualizationRuntimeContent: disableRuntime,
      renderedVisualizationRuntimeContent: !disableRuntime,
    });
    if (disableRuntime) {
      if (!runtimeContentSkipLoggedRef.current) {
        runtimeContentSkipLoggedRef.current = true;
        perfTrace('Runtime', 'skipped visualization runtime content mount', {
          requestId: runtimeBisectRequestId,
          lifecycle: runtimeBisectLifecycle ?? null,
        });
      }
    } else {
      runtimeContentSkipLoggedRef.current = false;
    }
  }, [
    disableRuntime,
    runtimeBisectRequestId,
    runtimeBisectLifecycle,
  ]);

  return (
    <View style={styles.root}>
      <View style={styles.canvas} pointerEvents="none">
        {disableRuntime ? (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: canvasBackground ?? '#0a0612' },
            ]}
          />
        ) : (
          <VisualizationCanvas
            visualizationRef={visualizationRef}
            controlsEnabled={controlsEnabled}
            inputEnabled={inputEnabled}
            canvasBackground={canvasBackground}
            clusterZoneHighlights={clusterZoneHighlights}
            freezeVisualizationRuntimeUpdates={freezeVisualizationRuntimeUpdates}
            runtimeBisectRequestId={runtimeBisectRequestId}
            runtimeBisectLifecycle={runtimeBisectLifecycle}
            onShortTap={onShortTap}
            onClusterTap={onClusterTap}
            onDoubleTap={onDoubleTap}
            onLongPressStart={onLongPressStart}
            onLongPressEnd={onLongPressEnd}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
          />
        )}
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
