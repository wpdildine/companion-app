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

/** Canonical center-hold threshold: press in center for this long to start hold-to-speak. */
const CENTER_HOLD_THRESHOLD_MS = 450;
/** Move beyond this (px) or leave center zone cancels the pending center hold. */
const CENTER_HOLD_MOVE_CANCEL_PX = 12;

export type InteractionBandProps = {
  visualizationRef: RefObject<VisualizationEngineRef | null>;
  /** Semantic commit on touch end (rules/cards only; center does nothing). */
  onClusterRelease?: (cluster: 'rules' | 'cards') => void;
  /** @deprecated Use onClusterRelease; kept for compatibility. */
  onClusterTap?: (cluster: 'rules' | 'cards') => void;
  /** Center spine hold: called once when hold timer fires. Primary hold-to-speak affordance. */
  onCenterHoldStart?: () => void;
  /** Center spine hold: called once when touch ends after hold had started. */
  onCenterHoldEnd?: () => void;
  enabled?: boolean;
};

export function InteractionBand({
  visualizationRef,
  onClusterRelease,
  onClusterTap,
  onCenterHoldStart,
  onCenterHoldEnd,
  enabled = true,
}: InteractionBandProps) {
  const layoutRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const centerHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerHoldStartedRef = useRef(false);

  const clearCenterHoldState = useCallback(() => {
    if (centerHoldTimerRef.current) {
      clearTimeout(centerHoldTimerRef.current);
      centerHoldTimerRef.current = null;
    }
    centerHoldStartedRef.current = false;
    touchStartRef.current = null;
  }, []);

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
    clearCenterHoldState();
    const v = visualizationRef.current;
    if (v) {
      v.touchFieldActive = false;
      v.touchFieldNdc = null;
      v.touchFieldStrength = 0;
      v.zoneArmed = null;
    }
  }, [enabled, visualizationRef, clearCenterHoldState]);

  const handleTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const { locationX, locationY } = e.nativeEvent;
      const v = visualizationRef.current;
      if (!v) return;
      const ndc = toNdc(locationX, locationY);
      if (ndc) {
        touchStartRef.current = { x: locationX, y: locationY };
        v.touchFieldActive = true;
        v.touchFieldNdc = ndc;
        v.touchFieldStrength = 1;
        setZoneArmedFromNdc(v, ndc);
        const zone = getZoneFromNdcX(ndc[0]);
        if (zone === null) {
          centerHoldTimerRef.current = setTimeout(() => {
            centerHoldTimerRef.current = null;
            if (!centerHoldStartedRef.current) {
              centerHoldStartedRef.current = true;
              onCenterHoldStart?.();
            }
          }, CENTER_HOLD_THRESHOLD_MS);
        }
      }
    },
    [visualizationRef, toNdc, enabled, setZoneArmedFromNdc, onCenterHoldStart],
  );

  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const { locationX, locationY } = e.nativeEvent;
      const v = visualizationRef.current;
      if (!v) return;
      const ndc = toNdc(locationX, locationY);
      if (ndc) {
        const zone = getZoneFromNdcX(ndc[0]);
        const start = touchStartRef.current;
        const movedPx = start
          ? Math.hypot(locationX - start.x, locationY - start.y)
          : 0;
        if (
          centerHoldTimerRef.current &&
          (zone !== null || movedPx > CENTER_HOLD_MOVE_CANCEL_PX)
        ) {
          clearTimeout(centerHoldTimerRef.current);
          centerHoldTimerRef.current = null;
        }
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
      const holdHadStarted = centerHoldStartedRef.current;
      clearCenterHoldState();
      if (v) {
        v.touchFieldActive = false;
        v.touchFieldNdc = null;
        v.touchFieldStrength = 0;
        v.zoneArmed = null;
      }
      if (holdHadStarted) {
        onCenterHoldEnd?.();
        return;
      }
      const { locationX, locationY } = e.nativeEvent;
      const ndc = toNdc(locationX, locationY);
      if (!ndc) return;
      const zone = getZoneFromNdcX(ndc[0]);
      const onRelease = onClusterRelease ?? onClusterTap;
      if (zone === 'rules') onRelease?.('rules');
      else if (zone === 'cards') onRelease?.('cards');
    },
    [
      visualizationRef,
      toNdc,
      onClusterRelease,
      onClusterTap,
      onCenterHoldEnd,
      enabled,
      clearCenterHoldState,
    ],
  );
  const handleTouchCancel = useCallback(() => {
    clearCenterHoldState();
    const v = visualizationRef.current;
    if (v) {
      v.touchFieldActive = false;
      v.touchFieldNdc = null;
      v.touchFieldStrength = 0;
      v.zoneArmed = null;
    }
  }, [visualizationRef, clearCenterHoldState]);

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
