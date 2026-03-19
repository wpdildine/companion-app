/**
 * 2D fallback when R3F is unavailable (e.g. Android).
 * Renders a flat solid background. Never returns an empty View (plan: fallback must render a minimal field).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';

const DEFAULT_FALLBACK_BG = '#000000';

export function VisualizationCanvasFallback({
  visualizationRef: _visualizationRef,
  canvasBackground = DEFAULT_FALLBACK_BG,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  canvasBackground?: string;
}) {
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { backgroundColor: canvasBackground },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: {},
});
