/**
 * Optional band that captures drag and drives the canvas-owned touch field (repulsor).
 * Plan: only this or the canvas sets touchField*; App must not.
 * Kept as a top-layer interaction surface while canvas stays pointerEvents="none".
 */

import React, { useRef, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import type { RefObject } from 'react';
import type { NodeMapEngineRef } from '../types';

const BAND_TOP_INSET = 112;

export type NodeMapInteractionBandProps = {
  nodeMapRef: RefObject<NodeMapEngineRef | null>;
  onClusterTap?: (cluster: 'rules' | 'cards') => void;
  enabled?: boolean;
};

const TAP_MAX_MS = 320;
const TAP_MAX_MOVE = 16;

export function NodeMapInteractionBand({
  nodeMapRef,
  onClusterTap,
  enabled = true,
}: NodeMapInteractionBandProps) {
  const layoutRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = e.nativeEvent.layout;
    layoutRef.current = { x, y, w, h };
  }, []);

  const toNdc = useCallback(
    (locationX: number, locationY: number): [number, number] | null => {
      const v = nodeMapRef.current;
      const layout = layoutRef.current;
      if (!v || !layout || v.canvasWidth <= 0 || v.canvasHeight <= 0) return null;
      const band = layout as { x: number; y: number; w: number; h: number };
      const screenX = band.x + locationX;
      const screenY = band.y + locationY;
      const ndcX = (screenX / v.canvasWidth) * 2 - 1;
      const ndcY = 1 - (screenY / v.canvasHeight) * 2;
      return [ndcX, ndcY];
    },
    [nodeMapRef],
  );

  const handleTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const { locationX, locationY } = e.nativeEvent;
      const v = nodeMapRef.current;
      if (!v) return;
      touchStartRef.current = { x: locationX, y: locationY, t: Date.now() };
      const ndc = toNdc(locationX, locationY);
      if (ndc) {
        v.touchFieldActive = true;
        v.touchFieldNdc = ndc;
        v.touchFieldStrength = 1;
      }
    },
    [nodeMapRef, toNdc, enabled],
  );

  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const { locationX, locationY } = e.nativeEvent;
      const v = nodeMapRef.current;
      if (!v) return;
      const ndc = toNdc(locationX, locationY);
      if (ndc) {
        v.touchFieldNdc = ndc;
        v.touchFieldStrength = 1;
      }
    },
    [nodeMapRef, toNdc, enabled],
  );

  const handleTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const v = nodeMapRef.current;
      if (v) {
        v.touchFieldActive = false;
        v.touchFieldNdc = null;
        v.touchFieldStrength = 0;
      }

      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const { locationX, locationY } = e.nativeEvent;
      const dt = Date.now() - start.t;
      const dist = Math.hypot(locationX - start.x, locationY - start.y);
      if (dt > TAP_MAX_MS || dist > TAP_MAX_MOVE) return;

      const ndc = toNdc(locationX, locationY);
      if (!ndc) return;
      if (ndc[0] < -0.12) onClusterTap?.('rules');
      else if (ndc[0] > 0.12) onClusterTap?.('cards');
    },
    [nodeMapRef, toNdc, onClusterTap, enabled],
  );

  return (
    <View
      style={styles.band}
      onLayout={onLayout}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      pointerEvents={enabled ? 'auto' : 'none'}
    />
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: BAND_TOP_INSET,
    zIndex: 2,
  },
});
