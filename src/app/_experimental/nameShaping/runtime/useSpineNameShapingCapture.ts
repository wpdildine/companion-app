/**
 * Name Shaping: spine touch-to-selector capture hook.
 * Maps touch lifecycle (start/move/end/cancel) to NameShaping state updates.
 * Only runs when enabled; when disabled all handlers are no-ops.
 */

import { useCallback, useRef } from 'react';
import type { NameShapingActions } from './useNameShapingState';
import { getSelectorFromNdc } from '../layout/nameShapingTouchRegions';
import { logInfo } from '../../../../shared/logging';

export interface NameShapingCaptureHandlers {
  onTouchStart: (ndc: [number, number]) => void;
  onTouchMove: (ndc: [number, number]) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
}

export interface UseSpineNameShapingCaptureOptions {
  emitOnTouchStart?: boolean;
  debugLogging?: boolean;
}

function noopStart(_ndc: [number, number]) {}
function noopMove(_ndc: [number, number]) {}
function noopEnd() {}
function noopCancel() {}

/**
 * Returns capture handlers that map interaction-band-local NDC to the
 * spine-local selector regions and update NameShaping state. When enabled:
 * touch start seeds the active selector only; move emits only on region
 * change; end/cancel clear activeSelector. The reserved center voice lane maps
 * to null. When disabled, all handlers are no-ops.
 */
export function useSpineNameShapingCapture(
  enabled: boolean,
  actions: NameShapingActions,
  options: UseSpineNameShapingCaptureOptions = {},
): { capture: NameShapingCaptureHandlers } {
  const lastSelectorRef = useRef<ReturnType<typeof getSelectorFromNdc>>(null);
  const emitOnTouchStart = options.emitOnTouchStart ?? false;
  const debugLogging = options.debugLogging ?? false;

  const onTouchStart = useCallback(
    (ndc: [number, number]) => {
      if (!enabled) return;
      const selector = getSelectorFromNdc(ndc[0], ndc[1]);
      lastSelectorRef.current = selector;
      actions.setActiveSelector(selector);
      if (emitOnTouchStart && selector !== null) {
        actions.appendEmittedToken({ selector, timestamp: Date.now() });
        if (debugLogging) {
          logInfo('NameShapingCapture', 'touch start emitted', { selector });
        }
      }
      if (debugLogging) {
        logInfo('NameShapingCapture', 'touch start', { selector });
      }
    },
    [enabled, actions, emitOnTouchStart, debugLogging],
  );

  const onTouchMove = useCallback(
    (ndc: [number, number]) => {
      if (!enabled) return;
      const selector = getSelectorFromNdc(ndc[0], ndc[1]);
      if (selector === lastSelectorRef.current) return;
      lastSelectorRef.current = selector;
      actions.setActiveSelector(selector);
      if (selector !== null) {
        actions.appendEmittedToken({ selector, timestamp: Date.now() });
        if (debugLogging) {
          logInfo('NameShapingCapture', 'region change', { selector });
        }
      }
    },
    [enabled, actions, debugLogging],
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled) return;
    lastSelectorRef.current = null;
    actions.setActiveSelector(null);
    if (debugLogging) {
      logInfo('NameShapingCapture', 'touch end');
    }
  }, [enabled, actions, debugLogging]);

  const onTouchCancel = useCallback(() => {
    if (!enabled) return;
    lastSelectorRef.current = null;
    actions.setActiveSelector(null);
    if (debugLogging) {
      logInfo('NameShapingCapture', 'touch cancel');
    }
  }, [enabled, actions, debugLogging]);

  const capture: NameShapingCaptureHandlers =
    enabled
      ? {
          onTouchStart,
          onTouchMove,
          onTouchEnd,
          onTouchCancel,
        }
      : {
          onTouchStart: noopStart,
          onTouchMove: noopMove,
          onTouchEnd: noopEnd,
          onTouchCancel: noopCancel,
        };

  return { capture };
}
