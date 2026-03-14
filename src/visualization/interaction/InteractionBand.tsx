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
 *
 * Invariant: Native touch remains the authoritative input path. No layout or refactor
 * should move primary touch semantics to GL/raycast; this band is the single touch owner.
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import type { RefObject } from 'react';
import { isCenterHoldEligible } from '../../app/nameShaping/layout/nameShapingInteractionRouting';
import { isVoiceLaneNdc } from '../../app/nameShaping/layout/nameShapingTouchRegions';
import type { VisualizationEngineRef } from '../runtime/runtimeTypes';
import { getZoneFromNdcX } from './zoneLayout';

/** Canonical center-hold threshold: press in center for this long to start hold-to-speak. */
const CENTER_HOLD_THRESHOLD_MS = 450;
/** Move beyond this (px) or leave center zone cancels the pending center hold. */
const CENTER_HOLD_MOVE_CANCEL_PX = 12;

/** When present, band invokes these with NDC and suppresses hold-to-speak and cluster release (debug capture priority). */
export type NameShapingCaptureHandlers = {
  onTouchStart: (ndc: [number, number]) => void;
  onTouchMove: (ndc: [number, number]) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
};

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
  /** When provided, touch NDC is forwarded to these handlers and band semantic actions (center hold, cluster release) are suppressed. */
  nameShapingCapture?: NameShapingCaptureHandlers;
  topInsetOverridePx?: number;
  enabled?: boolean;
  blocked?: boolean;
  blockedUntil?: number | null;
};

export function InteractionBand({
  visualizationRef,
  onClusterRelease,
  onClusterTap,
  onCenterHoldStart,
  onCenterHoldEnd,
  nameShapingCapture,
  topInsetOverridePx,
  enabled = true,
  blocked = false,
  blockedUntil = null,
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
    topInsetOverridePx ??
    visualizationRef.current?.scene?.zones.layout.bandTopInsetPx ??
    112;

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

  const toBandNdc = useCallback(
    (locationX: number, locationY: number): [number, number] | null => {
      const layout = layoutRef.current;
      if (!layout || layout.w <= 0 || layout.h <= 0) return null;
      const ndcX = (locationX / layout.w) * 2 - 1;
      const ndcY = 1 - (locationY / layout.h) * 2;
      return [ndcX, ndcY];
    },
    [],
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

  const blockedOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!blocked) {
      blockedOpacity.stopAnimation();
      blockedOpacity.setValue(0);
      return;
    }
    const now = Date.now();
    const duration = blockedUntil != null ? Math.max(0, blockedUntil - now) : 200;
    blockedOpacity.setValue(1);
    Animated.timing(blockedOpacity, {
      toValue: 0,
      duration,
      useNativeDriver: true,
    }).start();
  }, [blocked, blockedUntil, blockedOpacity]);

  const handleTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const { locationX, locationY } = e.nativeEvent;
      const v = visualizationRef.current;
      if (!v) return;
      const ndc = toNdc(locationX, locationY);
      const bandNdc = toBandNdc(locationX, locationY);
      const nameShapingActive = nameShapingCapture != null;
      if (ndc) {
        touchStartRef.current = { x: locationX, y: locationY };
        if (!nameShapingActive) {
          v.touchFieldActive = true;
          v.touchFieldNdc = ndc;
          v.touchFieldStrength = 1;
          setZoneArmedFromNdc(v, ndc);
        }
        const zone = getZoneFromNdcX(ndc[0]);
        const inVoiceLaneFromLayout =
          bandNdc != null ? isVoiceLaneNdc(bandNdc[0], bandNdc[1]) : false;
        const inVoiceLane = isCenterHoldEligible(
          nameShapingActive,
          inVoiceLaneFromLayout,
          zone,
        );
        if (inVoiceLane) {
          centerHoldTimerRef.current = setTimeout(() => {
            centerHoldTimerRef.current = null;
            if (!centerHoldStartedRef.current) {
              centerHoldStartedRef.current = true;
              onCenterHoldStart?.();
            }
          }, CENTER_HOLD_THRESHOLD_MS);
        }
        if (bandNdc) {
          nameShapingCapture?.onTouchStart(bandNdc);
        }
      }
    },
    [visualizationRef, toNdc, toBandNdc, enabled, setZoneArmedFromNdc, onCenterHoldStart, nameShapingCapture],
  );

  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const { locationX, locationY } = e.nativeEvent;
      const v = visualizationRef.current;
      if (!v) return;
      const ndc = toNdc(locationX, locationY);
      const bandNdc = toBandNdc(locationX, locationY);
      const nameShapingActive = nameShapingCapture != null;
      if (ndc) {
        const zone = getZoneFromNdcX(ndc[0]);
        const start = touchStartRef.current;
        const movedPx = start
          ? Math.hypot(locationX - start.x, locationY - start.y)
          : 0;
        const inVoiceLaneFromLayout =
          bandNdc != null ? isVoiceLaneNdc(bandNdc[0], bandNdc[1]) : false;
        const inVoiceLane = isCenterHoldEligible(
          nameShapingCapture != null,
          inVoiceLaneFromLayout,
          zone,
        );
        if (
          centerHoldTimerRef.current &&
          (!inVoiceLane || movedPx > CENTER_HOLD_MOVE_CANCEL_PX)
        ) {
          clearTimeout(centerHoldTimerRef.current);
          centerHoldTimerRef.current = null;
        }
        if (!nameShapingActive) {
          v.touchFieldNdc = ndc;
          v.touchFieldStrength = 1;
          setZoneArmedFromNdc(v, ndc);
        }
        if (bandNdc) {
          nameShapingCapture?.onTouchMove(bandNdc);
        }
      }
    },
    [visualizationRef, toNdc, toBandNdc, enabled, setZoneArmedFromNdc, nameShapingCapture],
  );

  const handleTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const v = visualizationRef.current;
      const holdHadStarted = centerHoldStartedRef.current;
      nameShapingCapture?.onTouchEnd();
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
      if (nameShapingCapture != null) {
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
      nameShapingCapture,
    ],
  );
  const handleTouchCancel = useCallback(() => {
    nameShapingCapture?.onTouchCancel();
    clearCenterHoldState();
    const v = visualizationRef.current;
    if (v) {
      v.touchFieldActive = false;
      v.touchFieldNdc = null;
      v.touchFieldStrength = 0;
      v.zoneArmed = null;
    }
  }, [visualizationRef, clearCenterHoldState, nameShapingCapture]);

  return (
    <View
      style={[styles.band, { top: bandTopInsetPx }]}
      onLayout={onLayout}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      pointerEvents={enabled ? 'auto' : 'none'}
    >
      {blocked && (
        <Animated.View
          pointerEvents="none"
          style={[styles.blockedOverlay, { opacity: blockedOpacity }]}
        />
      )}
    </View>
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
  blockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderColor: '#ff4a4a',
    borderWidth: 2,
    backgroundColor: 'rgba(255, 74, 74, 0.08)',
  },
});
