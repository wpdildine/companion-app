/**
 * Hook: single place for App to push AiUiSignals and events to the node map ref.
 * Exposes setSignals and emitEvent; all writes go through applySignalsToVisualization.
 */

import { useCallback, type RefObject } from 'react';
import { applySignalsToVisualization } from '../../visualization';
import type {
  VisualizationEngineRef,
  VisualizationMode,
  AiUiSignals,
  AiUiSignalsEvent,
  VisualizationPanelRects,
} from '../../visualization';

type AiVizInput = Partial<AiUiSignals> & {
  mode?: VisualizationMode;
  panelRects?: VisualizationPanelRects;
};

export function useAiVizBridge(visualizationRef: RefObject<VisualizationEngineRef | null>) {
  const setSignals = useCallback(
    (signals: AiVizInput) => {
      applySignalsToVisualization(visualizationRef, signals);
    },
    [visualizationRef],
  );

  const emitEvent = useCallback(
    (eventType: AiUiSignalsEvent) => {
      if (eventType == null) return;
      applySignalsToVisualization(visualizationRef, { event: eventType });
    },
    [visualizationRef],
  );

  return { setSignals, emitEvent };
}
