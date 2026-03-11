/**
 * Single bridge: App writes to visualizationRef only via this function (and intensity/reduceMotion).
 * Derives currentMode from phase; stores lastEvent/lastEventTime; optional signalsSnapshot for debug.
 * Render params (layerCount, deconWeight, etc.) are derived here when needed; do not add them to the signals API.
 */

import type { RefObject } from 'react';
import type {
  VisualizationEngineRef,
  VisualizationMode,
  VisualizationPanelRects,
} from './runtimeTypes';
import type { VisualizationSignals } from './visualizationSignals';
import { TARGET_ACTIVITY_BY_MODE } from './createDefaultRef';

const PHASE_TO_MODE: Record<VisualizationSignals['phase'], VisualizationMode> = {
  idle: 'idle',
  processing: 'processing',
  resolved: 'speaking',
};

/**
 * Writes visualization signals to visualizationRef. Derives currentMode from phase.
 * When signals.event is set, stores lastEvent and lastEventTime (using ref.clock).
 * Does not expose or accept render knobs (layerCount, driftPx, etc.) in the API.
 */
export function applyVisualizationSignals(
  visualizationRef: RefObject<VisualizationEngineRef | null>,
  signals: Partial<VisualizationSignals> & {
    mode?: VisualizationMode;
    panelRects?: VisualizationPanelRects;
  },
): void {
  const v = visualizationRef.current;
  if (!v) return;
  const { panelRects, ...uiSignals } = signals;
  const mergedSignals = {
    ...(v.signalsSnapshot ?? ({} as VisualizationSignals)),
    ...(uiSignals as Partial<VisualizationSignals>),
  } as VisualizationSignals;
  v.signalsSnapshot = mergedSignals;

  // Dev cycle owns mode when enabled in DevPanel; app signal pushes must not override it.
  const devModeOwned = v.stateCycleOn || v.canonicalCycleOn || v.modePinActive;
  if (!devModeOwned && signals.mode != null) {
    const mode = signals.mode;
    v.currentMode = mode;
    const target = TARGET_ACTIVITY_BY_MODE[mode];
    v.targetActivity = target;
  } else if (!devModeOwned && signals.phase != null) {
    const mode = PHASE_TO_MODE[signals.phase];
    v.currentMode = mode;
    const target = TARGET_ACTIVITY_BY_MODE[mode];
    v.targetActivity = target;
  }

  if (signals.event != null) {
    v.lastEvent = signals.event;
    v.lastEventTime = v.clock;
  }

  if (panelRects != null) {
    v.panelRects = panelRects;
  }

  const maxNodesPerCluster = 8;
  const phase = mergedSignals.phase ?? 'idle';
  const retrievalDepth = mergedSignals.retrievalDepth ?? 0;
  const cardRefsCount = mergedSignals.cardRefsCount ?? 0;

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

  const grounded = mergedSignals.grounded !== false;
  v.deconWeight = grounded
    ? Math.max(0, Math.min(1, 1 - (mergedSignals.confidence ?? 0.5)))
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
