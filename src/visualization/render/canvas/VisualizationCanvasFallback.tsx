/**
 * 2D fallback when R3F is unavailable (e.g. Android).
 * Renders a flat solid background. Never returns an empty View (plan: fallback must render a minimal field).
 * Reports layout to visualizationRef so InteractionBand gets correct canvasWidth/canvasHeight for NDC.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';

const DEFAULT_FALLBACK_BG = '#000000';

export function VisualizationCanvasFallback({
  visualizationRef,
  canvasBackground = DEFAULT_FALLBACK_BG,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  canvasBackground?: string;
}) {
  const onLayout = (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    if (visualizationRef.current) {
      visualizationRef.current.canvasWidth = width;
      visualizationRef.current.canvasHeight = height;
    }
  };
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: canvasBackground }]}
      onLayout={onLayout}
    />
  );
}

const styles = StyleSheet.create({
  root: {},
});
