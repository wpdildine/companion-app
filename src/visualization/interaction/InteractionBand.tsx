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
 *
 * Outbound semantic phases are documented in `bandInteractionContract.ts` (types only).
 */

import type { RefObject } from 'react';
import React, { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Animated, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { logInfo } from '../../shared/logging';
import type { VisualizationEngineRef } from '../runtime/runtimeTypes';
import { hasMovedBeyondThreshold } from './fastMath';
import { getZoneFromNdcX } from './zoneLayout';

/** Canonical center-hold threshold: press in center for this long to start hold-to-speak. */
const CENTER_HOLD_THRESHOLD_MS = 450;
/** Move beyond this (px) or leave center zone cancels the pending center hold. */
const CENTER_HOLD_MOVE_CANCEL_PX = 24;

/** True when active-region NDC X is in the neutral/center voice lane (rules/cards are non-null zones). */
function isCenterVoiceLaneFromCanvasNdc(ndcX: number): boolean {
  return getZoneFromNdcX(ndcX) === null;
}

export type InteractionBandProps = {
  visualizationRef: RefObject<VisualizationEngineRef | null>;
  /** Semantic commit on touch end (rules/cards only; center does nothing). Optional 2nd arg is diagnostic touch-end sequence id. */
  onClusterRelease?: (
    cluster: 'rules' | 'cards',
    diagnosticTouchEndId?: number,
  ) => void;
  /** @deprecated Use onClusterRelease; kept for compatibility. */
  onClusterTap?: (cluster: 'rules' | 'cards') => void;
  /** Center hold attempt: called when hold intent (timer or bypass) fires. Surface decides accept/reject and calls reportAccepted exactly once. Only accepted holds get onCenterHoldEnd on release. */
  onCenterHoldAttempt?: (
    reportAccepted: (accepted: boolean) => void,
  ) => void;
  /** Center spine hold: called when touch ends only if that touch's attempt was accepted. */
  onCenterHoldEnd?: () => void;
  /** Center short tap: early release before hold threshold. */
  onCenterHoldShortTap?: () => void;
  topInsetOverridePx?: number;
  enabled?: boolean;
  blocked?: boolean;
  blockedUntil?: number | null;
  /** When true, center-lane touches bypass the hold delay and route directly into the existing hold-start path. */
  centerHoldShouldBypassDelay?: boolean;
};

/** Semantic callbacks the band invokes toward the app shell; see `bandInteractionContract.ts` for phase docs. */
export type InteractionBandSemanticCallbacks = Pick<
  InteractionBandProps,
  | 'onClusterRelease'
  | 'onClusterTap'
  | 'onCenterHoldAttempt'
  | 'onCenterHoldEnd'
  | 'onCenterHoldShortTap'
>;

export function InteractionBand({
  visualizationRef,
  onClusterRelease,
  onClusterTap,
  onCenterHoldAttempt,
  onCenterHoldEnd,
  onCenterHoldShortTap,
  topInsetOverridePx,
  enabled = true,
  blocked = false,
  blockedUntil = null,
  centerHoldShouldBypassDelay = false,
}: InteractionBandProps) {
  const layoutRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);
  const shortTapEligibleRef = useRef(false);
  const centerHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set only when Surface calls reportAccepted(true); cleared on touch end/cancel. Only this drives onCenterHoldEnd. */
  const centerHoldAcceptedRef = useRef(false);
  /** Monotonic token for the current logical attempt so late callbacks cannot bless a later touch. */
  const centerHoldAttemptIdRef = useRef(0);
  const touchEndSequenceIdRef = useRef(0);
  const centerHoldPendingRef = useRef(false);

  // Tracks whether the current gesture was activated on the UI thread.
  // onTouchesUp sets it false after calling handleTouchEnd so onFinalize knows not to cancel.
  const touchActivated = useSharedValue(false);

  const clearCenterHoldState = useCallback(() => {
    if (centerHoldTimerRef.current) {
      clearTimeout(centerHoldTimerRef.current);
      centerHoldTimerRef.current = null;
    }
    centerHoldAcceptedRef.current = false;
    centerHoldPendingRef.current = false;
    centerHoldAttemptIdRef.current += 1;
    touchStartRef.current = null;
    shortTapEligibleRef.current = false;
  }, []);

  /** Creates a one-shot resolver bound to a single logical attempt. */
  const createAttemptReporter = useCallback(() => {
    const attemptId = centerHoldAttemptIdRef.current + 1;
    centerHoldAttemptIdRef.current = attemptId;
    let resolved = false;
    centerHoldPendingRef.current = true;

    return (accepted: boolean) => {
      if (resolved) return;
      resolved = true;
      centerHoldPendingRef.current = false;
      if (centerHoldAttemptIdRef.current !== attemptId) return;
      if (accepted) {
        centerHoldAcceptedRef.current = true;
      }
    };
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

  const handleTouchStart = useCallback(
    (locationX: number, locationY: number) => {
      if (!enabled) return;
      const v = visualizationRef.current;
      touchStartRef.current = { x: locationX, y: locationY, timestamp: Date.now() };
      shortTapEligibleRef.current = true;
      if (!v) return;

      const ndc = toNdc(locationX, locationY);
      if (ndc) {
        v.touchFieldActive = true;
        v.touchFieldNdc = ndc;
        v.touchFieldStrength = 1;
        setZoneArmedFromNdc(v, ndc);
        if (isCenterVoiceLaneFromCanvasNdc(ndc[0])) {
          if (centerHoldShouldBypassDelay) {
            onCenterHoldAttempt?.(createAttemptReporter());
          } else {
            centerHoldTimerRef.current = setTimeout(() => {
              centerHoldTimerRef.current = null;
              onCenterHoldAttempt?.(createAttemptReporter());
            }, CENTER_HOLD_THRESHOLD_MS);
          }
        }
      }
    },
    [
      visualizationRef,
      toNdc,
      enabled,
      centerHoldShouldBypassDelay,
      setZoneArmedFromNdc,
      onCenterHoldAttempt,
      createAttemptReporter,
    ],
  );

  const handleTouchMove = useCallback(
    (locationX: number, locationY: number) => {
      if (!enabled) return;
      const v = visualizationRef.current;
      if (!v) return;
      const ndc = toNdc(locationX, locationY);
      if (ndc) {
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
        const inCenterVoiceLane = isCenterVoiceLaneFromCanvasNdc(ndc[0]);
        if (centerHoldTimerRef.current && (!inCenterVoiceLane || movedBeyond)) {
          clearTimeout(centerHoldTimerRef.current);
          centerHoldTimerRef.current = null;
        }
        if (movedBeyond) {
          shortTapEligibleRef.current = false;
        }
        v.touchFieldNdc = ndc;
        v.touchFieldStrength = 1;
        setZoneArmedFromNdc(v, ndc);
      }
    },
    [visualizationRef, toNdc, enabled, setZoneArmedFromNdc],
  );

  const handleTouchEnd = useCallback(
    (locationX: number, locationY: number) => {
      if (!enabled) return;
      const sequenceId = ++touchEndSequenceIdRef.current;
      const timestamp = Date.now();
      const v = visualizationRef.current;
      const holdWasAccepted = centerHoldAcceptedRef.current;
      const start = touchStartRef.current;
      const durationMs = start ? timestamp - start.timestamp : 0;
      const isShortTap = shortTapEligibleRef.current && durationMs < CENTER_HOLD_THRESHOLD_MS;
      if (v) {
        v.touchFieldActive = false;
        v.touchFieldNdc = null;
        v.touchFieldStrength = 0;
        v.zoneArmed = null;
      }
      if (holdWasAccepted) {
        logInfo('Interaction', 'touchEnd (diagnosis)', {
          sequenceId,
          timestamp,
          holdWasAccepted: true,
          returnedViaCenterHoldEnd: true,
          reachedClusterPath: false,
        });
        onCenterHoldEnd?.();
        clearCenterHoldState();
        return;
      }
      const ndc = toNdc(locationX, locationY);
      if (!ndc) {
        logInfo('Interaction', 'touchEnd (diagnosis)', {
          sequenceId,
          timestamp,
          holdWasAccepted: false,
          returnedViaCenterHoldEnd: false,
          reachedClusterPath: false,
          earlyExit: 'noNdc',
        });
        clearCenterHoldState();
        return;
      }
      const zone = getZoneFromNdcX(ndc[0]);
      const isCenterShortTapZone = isCenterVoiceLaneFromCanvasNdc(ndc[0]);
      if (isShortTap) {
        logInfo('Interaction', 'touchEnd (diagnosis)', {
          sequenceId,
          timestamp,
          holdWasAccepted: false,
          returnedViaCenterHoldEnd: false,
          reachedClusterPath: false,
          earlyExit: 'shortTap',
          zone,
          locationX,
          locationY,
          ndcX: ndc[0],
        });
        // Localized 3D tap pulse is center lane only; transient `shortTap` still comes
        // from AgentSurface via onCenterHoldShortTap → emitEvent.
        const vr = visualizationRef.current;
        if (vr && isCenterShortTapZone) {
          vr.pendingTapNdc = ndc;
        }
        onCenterHoldShortTap?.();
        clearCenterHoldState();
        return;
      }
      logInfo('Interaction', 'touchEnd (diagnosis)', {
        sequenceId,
        timestamp,
        holdWasAccepted: false,
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
      clearCenterHoldState();
    },
    [
      visualizationRef,
      toNdc,
      onClusterRelease,
      onClusterTap,
      onCenterHoldEnd,
      onCenterHoldShortTap,
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

  const panGesture = React.useMemo(() => {
    return Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e, stateManager) => {
        if (!enabled || blocked) {
          touchActivated.value = false;
          stateManager.fail();
          return;
        }
        touchActivated.value = true;
        stateManager.activate();
        const touch = e.changedTouches[0];
        if (touch) {
          runOnJS(handleTouchStart)(touch.x, touch.y);
        }
      })
      .onUpdate((e) => {
        runOnJS(handleTouchMove)(e.x, e.y);
      })
      // onTouchesUp fires on every platform on finger-lift, regardless of Pan gesture success.
      // On iOS, Gesture.Pan() fires onFinalize(success=false) for zero-movement taps even after
      // stateManager.activate() — onEnd never fires. onTouchesUp is platform-agnostic.
      .onTouchesUp((e) => {
        if (!touchActivated.value) return;
        touchActivated.value = false;
        const touch = e.changedTouches[0];
        if (touch) {
          runOnJS(handleTouchEnd)(touch.x, touch.y);
        }
      })
      // onFinalize handles true cancellations (stateManager.fail() path, system interrupts).
      // If touchActivated is already false, onTouchesUp already handled the end — skip cancel.
      .onFinalize((_e, _success) => {
        if (!touchActivated.value) return;
        touchActivated.value = false;
        runOnJS(handleTouchCancel)();
      });
  }, [
    enabled,
    blocked,
    touchActivated,
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
