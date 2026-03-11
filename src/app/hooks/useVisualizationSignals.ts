/**
 * Hook: single place for App to push VisualizationSignals and events to the visualization ref.
 * Exposes setSignals and emitEvent; all writes go through applyVisualizationSignals.
 */

import { useCallback, type RefObject } from 'react';
import { applyVisualizationSignals } from '../../visualization';
import type {
  VisualizationEngineRef,
  VisualizationMode,
  VisualizationSignals,
  VisualizationSignalEvent,
  VisualizationPanelRects,
} from '../../visualization';

type VisualizationSignalInput = Partial<VisualizationSignals> & {
  mode?: VisualizationMode;
  panelRects?: VisualizationPanelRects;
};

export function useVisualizationSignals(
  visualizationRef: RefObject<VisualizationEngineRef | null>,
) {
  const setSignals = useCallback(
    (signals: VisualizationSignalInput) => {
      applyVisualizationSignals(visualizationRef, signals);
    },
    [visualizationRef],
  );

  const emitEvent = useCallback(
    (eventType: VisualizationSignalEvent) => {
      if (eventType == null) return;
      applyVisualizationSignals(visualizationRef, { event: eventType });
    },
    [visualizationRef],
  );

  return { setSignals, emitEvent };
}

