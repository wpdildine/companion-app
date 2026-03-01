/**
 * Single bridge: App writes to vizRef only via this function (and intensity/reduceMotion).
 * Derives currentMode from phase; stores lastEvent/lastEventTime; optional signalsSnapshot for debug.
 * Render params (layerCount, deconWeight, etc.) are derived here when needed; do not add them to the signals API.
 */

import type { RefObject } from 'react';
import type { VizEngineRef, VizMode, AiUiSignals } from '../types';
import { TARGET_ACTIVITY_BY_MODE } from '../types';

const PHASE_TO_MODE: Record<AiUiSignals['phase'], VizMode> = {
  idle: 'idle',
  processing: 'processing',
  resolved: 'speaking',
};

/**
 * Writes signals to vizRef. Derives currentMode from phase.
 * When signals.event is set, stores lastEvent and lastEventTime (using ref.clock).
 * Does not expose or accept render knobs (layerCount, driftPx, etc.) in the API.
 */
export function applySignalsToViz(
  vizRef: RefObject<VizEngineRef | null>,
  signals: Partial<AiUiSignals>,
): void {
  const v = vizRef.current;
  if (!v) return;

  v.signalsSnapshot = signals as AiUiSignals | undefined;

  if (signals.phase != null) {
    const mode = PHASE_TO_MODE[signals.phase];
    v.currentMode = mode;
    const target = TARGET_ACTIVITY_BY_MODE[mode];
    v.targetActivity = target;
    v.activity = target;
  }

  if (signals.event != null) {
    v.lastEvent = signals.event;
    v.lastEventTime = v.clock;
  }

  const maxNodesPerCluster = 8;
  const phase = signals.phase ?? 'idle';
  const retrievalDepth = signals.retrievalDepth ?? 0;
  const cardRefsCount = signals.cardRefsCount ?? 0;

  if (phase === 'processing') {
    v.rulesClusterCount = 0;
    v.cardsClusterCount = 0;
  } else {
    v.rulesClusterCount = Math.min(maxNodesPerCluster, Math.max(0, retrievalDepth));
    v.cardsClusterCount = Math.min(maxNodesPerCluster, Math.max(0, cardRefsCount));
  }

  if (phase === 'processing') {
    v.layerCount = 2;
  } else if (phase === 'resolved' && retrievalDepth === 0 && cardRefsCount === 0) {
    v.layerCount = 2;
  } else {
    v.layerCount = Math.min(
      3,
      1 + Math.min(2, Math.ceil(retrievalDepth / 4) + Math.ceil(cardRefsCount / 4)),
    );
  }

  const grounded = signals.grounded !== false;
  v.deconWeight = grounded
    ? Math.max(0, Math.min(1, 1 - (signals.confidence ?? 0.5)))
    : 0.2;
  v.hueShift = grounded ? v.deconWeight * 0.08 : 0;

  if (phase === 'processing') {
    v.planeOpacity = 0.22;
    v.driftPx = 2;
  } else if (phase === 'resolved' && retrievalDepth === 0 && cardRefsCount === 0) {
    v.planeOpacity = 0.18;
    v.driftPx = 1;
  } else {
    v.planeOpacity = grounded ? 0.18 + v.deconWeight * 0.18 : 0.14;
    v.driftPx = grounded ? 1 + Math.round(v.deconWeight * 3) : 1;
  }
}
