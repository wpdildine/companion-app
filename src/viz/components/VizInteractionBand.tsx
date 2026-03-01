/**
 * Optional band that captures drag and drives the canvas-owned touch field (repulsor).
 * Plan: only this or the canvas sets touchField*; App must not.
 */

import React, { useRef, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import type { RefObject } from 'react';
import type { VizEngineRef } from '../types';

const BAND_HEIGHT = 80;

export type VizInteractionBandProps = {
  vizRef: RefObject<VizEngineRef | null>;
};

export function VizInteractionBand({ vizRef }: VizInteractionBandProps) {
  const layoutRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = e.nativeEvent.layout;
    layoutRef.current = { x, y, w, h };
  }, []);

  const toNdc = useCallback(
    (locationX: number, locationY: number): [number, number] | null => {
      const v = vizRef.current;
      const layout = layoutRef.current;
      if (!v || !layout || v.canvasWidth <= 0 || v.canvasHeight <= 0) return null;
      const band = layout as { x: number; y: number; w: number; h: number };
      // Touch is in band-local coords. Band layout (x,y,w,h) is in parent (root) coords; canvas matches root.
      // NDC: x in [-1,1] left to right, y in [-1,1] bottom to top.
      const screenX = band.x + locationX;
      const screenY = band.y + locationY;
      const ndcX = (screenX / v.canvasWidth) * 2 - 1;
      const ndcY = 1 - (screenY / v.canvasHeight) * 2;
      return [ndcX, ndcY];
    },
    [vizRef],
  );

  const handleTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      const v = vizRef.current;
      if (!v) return;
      const ndc = toNdc(locationX, locationY);
      if (ndc) {
        v.touchFieldActive = true;
        v.touchFieldNdc = ndc;
        v.touchFieldStrength = 1;
      }
    },
    [vizRef, toNdc],
  );

  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      const v = vizRef.current;
      if (!v) return;
      const ndc = toNdc(locationX, locationY);
      if (ndc) {
        v.touchFieldNdc = ndc;
        v.touchFieldStrength = 1;
      }
    },
    [vizRef, toNdc],
  );

  const handleTouchEnd = useCallback(() => {
    if (vizRef.current) {
      vizRef.current.touchFieldActive = false;
      vizRef.current.touchFieldNdc = null;
      vizRef.current.touchFieldStrength = 0;
    }
  }, [vizRef]);

  return (
    <View
      style={styles.band}
      onLayout={onLayout}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      pointerEvents="auto"
    />
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: BAND_HEIGHT,
    zIndex: 2,
  },
});
