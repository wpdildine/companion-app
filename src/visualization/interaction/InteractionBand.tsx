/**
 * Optional band that captures drag and drives the canvas-owned touch field (repulsor).
 * Plan: only this or the canvas sets touchField*; App must not.
 * Kept as a top-layer interaction surface while canvas stays pointerEvents="none".
 *
 * NDC invariant: zone classification uses active-region NDC only. toNdc(bandRect, canvasSize)
 * is the only path to NDC — never use raw screen normalization (e.g. touchX/screenWidth).
 *
 * Touch lifecycle model:
 * 1) start/move => continuous organism write path only (touchField* + zoneArmed)
 * 2) end        => semantic commit path only (left/right release emits callback)
 * 3) cancel     => clear state, no semantic callback
 *
 * This separates "physical response while touching" from "discrete action on release."
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import type { RefObject } from 'react';
import type { VisualizationEngineRef } from '../engine/types';
import { getZoneFromNdcX } from './zoneLayout';

export type InteractionBandProps = {
  visualizationRef: RefObject<VisualizationEngineRef | null>;
  /** Semantic commit on touch end. */
  onClusterRelease?: (cluster: 'rules' | 'cards') => void;
  /** @deprecated Use onClusterRelease; kept for compatibility. */
  onClusterTap?: (cluster: 'rules' | 'cards') => void;
  enabled?: boolean;
};

export function InteractionBand({
  visualizationRef,
  onClusterRelease,
  onClusterTap,
  enabled = true,
}: InteractionBandProps) {
  const layoutRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

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
      // zoneArmed is purely a transient hint while touch is down.
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
      const ndc = toNdc(locationX, locationY);
      if (ndc) {
        // Continuous touch field starts immediately on press-down.
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
        // Keep organism field hot while finger moves; semantics still deferred to release.
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
        // Always clear continuous field first; release semantics are computed from final pointer.
        v.touchFieldActive = false;
        v.touchFieldNdc = null;
        v.touchFieldStrength = 0;
        v.zoneArmed = null;
      }
      const { locationX, locationY } = e.nativeEvent;
      const ndc = toNdc(locationX, locationY);
      if (!ndc) return;
      const zone = getZoneFromNdcX(ndc[0]);
      const onRelease = onClusterRelease ?? onClusterTap;
      // Semantic commit on release only (center neutral strip commits nothing).
      if (zone === 'rules') onRelease?.('rules');
      else if (zone === 'cards') onRelease?.('cards');
    },
    [visualizationRef, toNdc, onClusterRelease, onClusterTap, enabled],
  );
  const handleTouchCancel = useCallback(() => {
    const v = visualizationRef.current;
    if (v) {
      // Cancel should never emit semantic actions; clear and exit.
      v.touchFieldActive = false;
      v.touchFieldNdc = null;
      v.touchFieldStrength = 0;
      v.zoneArmed = null;
    }
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
