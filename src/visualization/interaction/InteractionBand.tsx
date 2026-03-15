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
 * Invariant: Native touch remains the authoritative input path. Pan is the sole physical
 * gesture owner; tap-like and hold-like semantics are preserved via JS handlers (runOnJS).
 */

import type { RefObject } from 'react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Animated, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { isCenterHoldEligible } from '../../app/nameShaping/layout/nameShapingInteractionRouting';
import { isVoiceLaneNdc } from '../../app/nameShaping/layout/nameShapingTouchRegions';
import { logInfo } from '../../shared/logging';
import type { VisualizationEngineRef } from '../runtime/runtimeTypes';
import { hasMovedBeyondThreshold } from './fastMath';
import { InteractionProbe } from './InteractionProbe';
import type { InteractionProbeDebugState } from './InteractionProbe';
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
  /** Semantic commit on touch end (rules/cards only; center does nothing). Optional 2nd arg is diagnostic touch-end sequence id. */
  onClusterRelease?: (
    cluster: 'rules' | 'cards',
    diagnosticTouchEndId?: number,
  ) => void;
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
  /** When true, center-lane touches bypass the hold delay and route directly into the existing hold-start path. */
  centerHoldShouldBypassDelay?: boolean;
  /** When true, band renders passive debug overlay (InteractionProbe) with NDC/zone/eligibility readout. */
  debugInteraction?: boolean;
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
  centerHoldShouldBypassDelay = false,
  debugInteraction = false,
}: InteractionBandProps) {
  const layoutRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const centerHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerHoldStartedRef = useRef(false);
  const touchEndSequenceIdRef = useRef(0);

  const [debugState, setDebugState] = useState<InteractionProbeDebugState | null>(null);
  const [layoutSize, setLayoutSize] = useState({ w: 0, h: 0 });

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
    setLayoutSize({ w, h });
  }, []);
  const bandTopInsetPx =
    topInsetOverridePx ??
    visualizationRef.current?.scene?.zones.layout.bandTopInsetPx ??
    112;

  const toNdc = useCallback(
    (locationX: number, locationY: number): [number, number] | null => {
      const v = visualizationRef.current;
      const layout = layoutRef.current;
      if (!v || !layout || v.canvasWidth <= 0 || v.canvasHeight <= 0)
        return null;
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
    const duration =
      blockedUntil != null ? Math.max(0, blockedUntil - now) : 200;
    blockedOpacity.setValue(1);
    Animated.timing(blockedOpacity, {
      toValue: 0,
      duration,
      useNativeDriver: true,
    }).start();
  }, [blocked, blockedUntil, blockedOpacity]);

  const updateDebugState = useCallback(
    (touchActive: boolean, locationX?: number, locationY?: number) => {
      if (!debugInteraction) return;
      if (!touchActive) {
        setDebugState(null);
        return;
      }
      const layout = layoutRef.current;
      if (!layout || locationX == null || locationY == null) return;
      const ndc = toNdc(locationX, locationY);
      const bandNdc = toBandNdc(locationX, locationY);
      const zone = ndc ? getZoneFromNdcX(ndc[0]) : null;
      const inVoiceLaneFromLayout =
        bandNdc != null ? isVoiceLaneNdc(bandNdc[0], bandNdc[1]) : false;
      const eligible = isCenterHoldEligible(
        nameShapingCapture != null,
        inVoiceLaneFromLayout,
        zone,
      );
      setDebugState({
        ndc,
        zone,
        eligible,
        touchActive: true,
      });
    },
    [debugInteraction, toNdc, toBandNdc, nameShapingCapture],
  );

  const handleTouchStart = useCallback(
    (locationX: number, locationY: number) => {
      if (!enabled) return;
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
          if (centerHoldShouldBypassDelay) {
            centerHoldStartedRef.current = true;
            onCenterHoldStart?.();
          } else {
            centerHoldTimerRef.current = setTimeout(() => {
              centerHoldTimerRef.current = null;
              if (!centerHoldStartedRef.current) {
                centerHoldStartedRef.current = true;
                onCenterHoldStart?.();
              }
            }, CENTER_HOLD_THRESHOLD_MS);
          }
        }
        if (bandNdc) {
          nameShapingCapture?.onTouchStart(bandNdc);
        }
      }
      updateDebugState(true, locationX, locationY);
    },
    [
      visualizationRef,
      toNdc,
      toBandNdc,
      enabled,
      centerHoldShouldBypassDelay,
      setZoneArmedFromNdc,
      onCenterHoldStart,
      nameShapingCapture,
      updateDebugState,
    ],
  );

  const handleTouchMove = useCallback(
    (locationX: number, locationY: number) => {
      if (!enabled) return;
      const v = visualizationRef.current;
      if (!v) return;
      const ndc = toNdc(locationX, locationY);
      const bandNdc = toBandNdc(locationX, locationY);
      const nameShapingActive = nameShapingCapture != null;
      if (ndc) {
        const zone = getZoneFromNdcX(ndc[0]);
        const start = touchStartRef.current;
        const movedBeyond =
          start != null &&
          hasMovedBeyondThreshold(
            start.x,
            start.y,
            locationX,
            locationY,
            CENTER_HOLD_MOVE_CANCEL_PX,
          );
        const inVoiceLaneFromLayout =
          bandNdc != null ? isVoiceLaneNdc(bandNdc[0], bandNdc[1]) : false;
        const inVoiceLane = isCenterHoldEligible(
          nameShapingCapture != null,
          inVoiceLaneFromLayout,
          zone,
        );
        if (
          centerHoldTimerRef.current &&
          (!inVoiceLane || movedBeyond)
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
      updateDebugState(true, locationX, locationY);
    },
    [
      visualizationRef,
      toNdc,
      toBandNdc,
      enabled,
      setZoneArmedFromNdc,
      nameShapingCapture,
      updateDebugState,
    ],
  );

  const handleTouchEnd = useCallback(
    (locationX: number, locationY: number) => {
      if (!enabled) return;
      const sequenceId = ++touchEndSequenceIdRef.current;
      const timestamp = Date.now();
      const v = visualizationRef.current;
      const holdHadStarted = centerHoldStartedRef.current;
      nameShapingCapture?.onTouchEnd();
      clearCenterHoldState();
      updateDebugState(false);
      if (v) {
        v.touchFieldActive = false;
        v.touchFieldNdc = null;
        v.touchFieldStrength = 0;
        v.zoneArmed = null;
      }
      if (holdHadStarted) {
        logInfo('Interaction', 'touchEnd (Android diagnosis)', {
          sequenceId,
          timestamp,
          holdHadStarted: true,
          returnedViaCenterHoldEnd: true,
          reachedClusterPath: false,
        });
        onCenterHoldEnd?.();
        return;
      }
      if (nameShapingCapture != null) {
        logInfo('Interaction', 'touchEnd (Android diagnosis)', {
          sequenceId,
          timestamp,
          holdHadStarted: false,
          returnedViaCenterHoldEnd: false,
          reachedClusterPath: false,
          earlyExit: 'nameShapingCapture',
        });
        return;
      }
      const ndc = toNdc(locationX, locationY);
      if (!ndc) {
        logInfo('Interaction', 'touchEnd (Android diagnosis)', {
          sequenceId,
          timestamp,
          holdHadStarted: false,
          returnedViaCenterHoldEnd: false,
          reachedClusterPath: false,
          earlyExit: 'noNdc',
        });
        return;
      }
      const zone = getZoneFromNdcX(ndc[0]);
      logInfo('Interaction', 'touchEnd (Android diagnosis)', {
        sequenceId,
        timestamp,
        holdHadStarted: false,
        returnedViaCenterHoldEnd: false,
        reachedClusterPath: true,
        zone,
        locationX,
        locationY,
        ndcX: ndc[0],
      });
      const onRelease = onClusterRelease ?? onClusterTap;
      if (zone === 'rules') onRelease?.('rules', sequenceId);
      else if (zone === 'cards') onRelease?.('cards', sequenceId);
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
      updateDebugState,
    ],
  );

  const handleTouchCancel = useCallback(() => {
    nameShapingCapture?.onTouchCancel();
    clearCenterHoldState();
    updateDebugState(false);
    const v = visualizationRef.current;
    if (v) {
      v.touchFieldActive = false;
      v.touchFieldNdc = null;
      v.touchFieldStrength = 0;
      v.zoneArmed = null;
    }
  }, [
    visualizationRef,
    clearCenterHoldState,
    nameShapingCapture,
    updateDebugState,
  ]);

  const panGesture = React.useMemo(() => {
    return Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((_e, stateManager) => {
        if (!enabled || blocked) {
          stateManager.fail();
          return;
        }
        stateManager.activate();
      })
      .onStart((e) => {
        runOnJS(handleTouchStart)(e.x, e.y);
      })
      .onUpdate((e) => {
        runOnJS(handleTouchMove)(e.x, e.y);
      })
      .onEnd((e, success) => {
        if (!success) return;
        runOnJS(handleTouchEnd)(e.x, e.y);
      })
      .onFinalize((_e, success) => {
        if (success) return;
        runOnJS(handleTouchCancel)();
      });
  }, [
    enabled,
    blocked,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  ]);

  return (
    <View
      style={[styles.band, { top: bandTopInsetPx }]}
      onLayout={onLayout}
      pointerEvents={enabled ? 'auto' : 'none'}
    >
      <GestureDetector gesture={panGesture}>
        <View collapsable={false} style={StyleSheet.absoluteFill}>
          {debugInteraction && (
            <InteractionProbe
              debugState={debugState}
              layoutW={layoutSize.w}
              layoutH={layoutSize.h}
            />
          )}
          {blocked && (
            <Animated.View
              pointerEvents="none"
              style={[styles.blockedOverlay, { opacity: blockedOpacity }]}
            />
          )}
        </View>
      </GestureDetector>
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
