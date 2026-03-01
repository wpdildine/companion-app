/**
 * Hook: single place for App to push AiUiSignals and events to the node map ref.
 * Exposes setSignals and emitEvent; all writes go through applySignalsToNodeMap.
 */

import { useCallback, type RefObject } from 'react';
import { applySignalsToNodeMap } from '../../nodeMap/helpers/applySignalsToNodeMap';
import type {
  NodeMapEngineRef,
  AiUiSignals,
  AiUiSignalsEvent,
  NodeMapPanelRects,
} from '../../nodeMap/types';

type AiVizInput = Partial<AiUiSignals> & { panelRects?: NodeMapPanelRects };

export function useAiVizBridge(nodeMapRef: RefObject<NodeMapEngineRef | null>) {
  const setSignals = useCallback(
    (signals: AiVizInput) => {
      applySignalsToNodeMap(nodeMapRef, signals);
    },
    [nodeMapRef],
  );

  const emitEvent = useCallback(
    (eventType: AiUiSignalsEvent) => {
      if (eventType == null) return;
      applySignalsToNodeMap(nodeMapRef, { event: eventType });
    },
    [nodeMapRef],
  );

  return { setSignals, emitEvent };
}
