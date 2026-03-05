/**
 * Optional band that captures drag and drives the canvas-owned touch field (repulsor).
 * Plan: only this or the canvas sets touchField*; App must not.
 * Kept as a top-layer interaction surface while canvas stays pointerEvents="none".
 *
 * NDC invariant: zone classification uses active-region NDC only. toNdc(bandRect, canvasSize)
 * is the only path to NDC — never use raw screen normalization (e.g. touchX/screenWidth).
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import type { RefObject } from 'react';
import type { VisualizationEngineRef } from '../engine/types';
import { getZoneFromNdcX } from './zoneLayout';

export type InteractionBandProps = {
  visualizationRef: RefObject<VisualizationEngineRef | null>;
  onClusterTap?: (cluster: 'rules' | 'cards') => void;
  enabled?: boolean;
};

const TAP_MAX_MS = 320;
const TAP_MAX_MOVE = 16;

export function InteractionBand({
  visualizationRef,
  onClusterTap,
  enabled = true,
}: InteractionBandProps) {
  const layoutRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = e.nativeEvent.layout;
    layoutRef.current = { x, y, w, h };
  }, []);
  const bandTopInsetPx =
    visualizationRef.current?.scene?.zones.layout.bandTopInsetPx ?? 112;

  const toNdc = useCallback(
    (locationX: number, locationY: number): [number, number] | null => {
      const v = visualizationRef.current;
      const layout = layoutRef.current;
      if (!v || !layout || v.canvasWidth <= 0 || v.canvasHeight <= 0) return null;
      const band = layout as { x: number; y: number; w: number; h: number };
      const screenX = band.x + locationX;
      const screenY = band.y + locationY;
      const ndcX = (screenX / v.canvasWidth) * 2 - 1;
      const ndcY = 1 - (screenY / v.canvasHeight) * 2;
      return [ndcX, ndcY];
    },
    [visualizationRef],
  );

  const setZoneArmedFromNdc = useCallback(
    (v: VisualizationEngineRef, ndc: [number, number]) => {
      v.zoneArmed = getZoneFromNdcX(ndc[0]);
    },
    [],
  );

  useEffect(() => {
    if (enabled) return;
    const v = visualizationRef.current;
    if (v) {
      v.touchFieldActive = false;
      v.touchFieldNdc = null;
      v.touchFieldStrength = 0;
      v.zoneArmed = null;
    }
  }, [enabled, visualizationRef]);

  const handleTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const { locationX, locationY } = e.nativeEvent;
      const v = visualizationRef.current;
      if (!v) return;
      touchStartRef.current = { x: locationX, y: locationY, t: Date.now() };
      const ndc = toNdc(locationX, locationY);
      if (ndc) {
        v.touchFieldActive = true;
        v.touchFieldNdc = ndc;
        v.touchFieldStrength = 1;
        setZoneArmedFromNdc(v, ndc);
      }
    },
    [visualizationRef, toNdc, enabled, setZoneArmedFromNdc],
  );

  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const { locationX, locationY } = e.nativeEvent;
      const v = visualizationRef.current;
      if (!v) return;
      const ndc = toNdc(locationX, locationY);
      if (ndc) {
        v.touchFieldNdc = ndc;
        v.touchFieldStrength = 1;
        setZoneArmedFromNdc(v, ndc);
      }
    },
    [visualizationRef, toNdc, enabled, setZoneArmedFromNdc],
  );

  const handleTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const v = visualizationRef.current;
      if (v) {
        v.touchFieldActive = false;
        v.touchFieldNdc = null;
        v.touchFieldStrength = 0;
        v.zoneArmed = null;
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
      const zone = getZoneFromNdcX(ndc[0]);
      if (zone === 'rules') onClusterTap?.('rules');
      else if (zone === 'cards') onClusterTap?.('cards');
    },
    [visualizationRef, toNdc, onClusterTap, enabled],
  );
  const handleTouchCancel = useCallback(() => {
    const v = visualizationRef.current;
    if (v) {
      v.touchFieldActive = false;
      v.touchFieldNdc = null;
      v.touchFieldStrength = 0;
      v.zoneArmed = null;
    }
    touchStartRef.current = null;
  }, [visualizationRef]);

  return (
    <View
      style={[styles.band, { top: bandTopInsetPx }]}
      onLayout={onLayout}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
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
    zIndex: 2,
  },
});
