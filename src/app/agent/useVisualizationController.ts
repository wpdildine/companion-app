/**
 * VisualizationController: translation layer from normalized agent state to visualization.
 * Maps AgentOrchestrator state into visualization signals; reacts to lifecycle callbacks for pulses/events.
 * Writes only through useVisualizationSignals / applySignalsToVisualization. Provider-agnostic.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { logInfo } from '../../shared/logging';
import { applySignalsToVisualization, triggerPulseAtCenter } from '../../visualization';
import type { VisualizationEngineRef } from '../../visualization';
import { useVisualizationSignals } from '../hooks/useVisualizationSignals';
import type { AgentOrchestratorState, AgentOrchestratorListeners } from './types';

/** Maps AgentLifecycleState to VisualizationMode (engine contract). */
function lifecycleToMode(
  lifecycle: AgentOrchestratorState['lifecycle'],
): 'idle' | 'listening' | 'processing' | 'speaking' {
  switch (lifecycle) {
    case 'listening':
      return 'listening';
    case 'thinking':
    case 'retrieving':
      return 'processing';
    case 'speaking':
      return 'speaking';
    case 'complete':
    case 'error':
    case 'idle':
    default:
      return 'idle';
  }
}

export interface UseVisualizationControllerOptions {
  /** When true, do not push mode/phase so DevPanel/EngineLoop own mode. */
  debugEnabled?: boolean;
  /** When true, always push dummy signals (instrument-panel verification). */
  debugScenario?: boolean;
}

/**
 * Subscribes to orchestrator state and populates listenersRef so the orchestrator
 * can drive pulses/events. Syncs state to visualization ref via setSignals only.
 */
export function useVisualizationController(
  visualizationRef: RefObject<VisualizationEngineRef | null>,
  state: AgentOrchestratorState,
  listenersRef: RefObject<AgentOrchestratorListeners | null>,
  options: UseVisualizationControllerOptions = {},
): void {
  const { debugEnabled = false, debugScenario = false } = options;
  const { setSignals, emitEvent } = useVisualizationSignals(visualizationRef);
  const setSignalsRef = useRef(setSignals);
  const emitEventRef = useRef(emitEvent);
  setSignalsRef.current = setSignals;
  emitEventRef.current = emitEvent;

  const dummySignals = {
    phase: 'resolved' as const,
    grounded: true,
    confidence: 0.82,
    retrievalDepth: 3,
    cardRefsCount: 2,
  };

  // Populate listeners so orchestrator can drive pulses and semantic events
  useEffect(() => {
    logInfo('VisualizationController', 'initialized');
    const ref = visualizationRef;
    listenersRef.current = {
      onListeningStart: () => {},
      onListeningEnd: () => {},
      onTranscriptUpdate: () => {
        if (ref.current) triggerPulseAtCenter(ref);
      },
      onRequestStart: () => {},
      onRetrievalStart: () => {},
      onRetrievalEnd: () => {},
      onGenerationStart: () => {},
      onFirstToken: () => {},
      onGenerationEnd: () => {
        logInfo('VisualizationController', 'emitted event chunkAccepted');
        emitEventRef.current('chunkAccepted');
      },
      onPlaybackStart: () => {},
      onPlaybackEnd: () => {},
      onComplete: () => {},
      onError: () => {},
    };
    return () => {
      listenersRef.current = null;
    };
  }, [visualizationRef, listenersRef]);

  const attachedLoggedRef = useRef(false);
  const lastLoggedModeRef = useRef<string | null>(null);
  const lastLoggedLifecycleRef = useRef<string | null>(null);

  // Map normalized agent state → visualization signals (mode, phase, grounded, etc.)
  useEffect(() => {
    if (debugScenario) {
      const withOptionalMode = <T extends object>(payload: T): T => {
        if (debugEnabled) {
          const { mode: _m, phase: _p, ...rest } = payload as T & {
            mode?: string;
            phase?: string;
          };
          return rest as T;
        }
        return payload as T;
      };
      setSignals(withOptionalMode(dummySignals));
      return;
    }

    const mode = lifecycleToMode(state.lifecycle);
    const phase =
      state.lifecycle === 'thinking' || state.lifecycle === 'retrieving'
        ? 'processing'
        : state.lifecycle === 'speaking'
          ? 'resolved'
          : 'idle';

    if (lastLoggedLifecycleRef.current !== state.lifecycle) {
      lastLoggedLifecycleRef.current = state.lifecycle;
      logInfo('VisualizationController', `received lifecycle state ${state.lifecycle}`);
    }
    if (lastLoggedModeRef.current !== mode) {
      lastLoggedModeRef.current = mode;
      logInfo('VisualizationController', `applied visualization mode ${mode}`);
    }
    const grounded =
      state.validationSummary != null
        ? state.validationSummary.stats.unknownCardCount === 0 &&
          state.validationSummary.stats.invalidRuleCount === 0
        : true;
    const confidence = grounded ? 0.9 : 0.5;
    const retrievalDepth =
      phase === 'processing' ? 0 : (state.validationSummary?.rules?.length ?? 0);
    const cardRefsCount =
      phase === 'processing' ? 0 : (state.validationSummary?.cards?.length ?? 0);

    const withOptionalMode = <T extends object>(payload: T): T => {
      if (debugEnabled) {
        const { mode: _m, phase: _p, ...rest } = payload as T & {
          mode?: string;
          phase?: string;
        };
        return rest as T;
      }
      return { ...payload, mode } as T;
    };

    setSignals(
      withOptionalMode({
        phase,
        grounded,
        confidence,
        retrievalDepth,
        cardRefsCount,
      }),
    );
    if (!attachedLoggedRef.current) {
      attachedLoggedRef.current = true;
      logInfo('VisualizationController', 'attached to visualization signal pipeline');
    }
  }, [
    state.lifecycle,
    state.validationSummary,
    setSignals,
    debugEnabled,
    debugScenario,
  ]);
}
