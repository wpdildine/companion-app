/**
 * Hook: single place for App to push AiUiSignals and events to the viz ref.
 * Exposes setSignals and emitEvent; all writes go through applySignalsToViz.
 */

import { useCallback, type RefObject } from 'react';
import { applySignalsToViz } from '../../viz/helpers/applySignalsToViz';
import type {
  VizEngineRef,
  AiUiSignals,
  AiUiSignalsEvent,
  VizPanelRects,
} from '../../viz/types';

type AiVizInput = Partial<AiUiSignals> & { panelRects?: VizPanelRects };

export function useAiVizBridge(vizRef: RefObject<VizEngineRef | null>) {
  const setSignals = useCallback(
    (signals: AiVizInput) => {
      applySignalsToViz(vizRef, signals);
    },
    [vizRef],
  );

  const emitEvent = useCallback(
    (eventType: AiUiSignalsEvent) => {
      if (eventType == null) return;
      applySignalsToViz(vizRef, { event: eventType });
    },
    [vizRef],
  );

  return { setSignals, emitEvent };
}
