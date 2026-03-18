/**
 * VisualizationController: translation layer from normalized agent state to visualization.
 * Maps AgentOrchestrator state into visualization signals; reacts to lifecycle callbacks for pulses/events.
 * Writes only through useVisualizationSignals / applyVisualizationSignals. Provider-agnostic.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { logInfo, perfTrace } from '../../shared/logging';
import {
  triggerPulseAtCenter,
  TRANSIENT_SIGNAL_FIRST_TOKEN,
  TRANSIENT_SIGNAL_SOFT_FAIL,
  TRANSIENT_SIGNAL_TERMINAL_FAIL,
} from '../../visualization';
import type { VisualizationEngineRef } from '../../visualization';
import { useVisualizationSignals } from '../hooks/useVisualizationSignals';
import {
  DIAG_SKIP_LATE_PROCESSING_VIZ_UPDATES,
  DIAG_SKIP_PLAYBACK_TRANSITION_STATE,
  traceLateProcessingVizUpdate,
} from '../ui/components/overlays/responseRenderBisectFlags';
import type {
  AgentOrchestratorState,
  AgentOrchestratorListeners,
  ProcessingSubstate,
} from './types';

/** Maps AgentLifecycleState to VisualizationMode (engine contract). */
function lifecycleToMode(
  lifecycle: AgentOrchestratorState['lifecycle'],
): 'idle' | 'listening' | 'processing' | 'speaking' {
  switch (lifecycle) {
    case 'listening':
      return 'listening';
    case 'processing':
      return 'processing';
    case 'speaking':
      return 'speaking';
    case 'error':
    case 'idle':
    default:
      return 'idle';
  }
}

/**
 * When lifecycle is listening but audio session is stopping/settling (post-release, awaiting STT),
 * project as idle so the surface does not read as actively listening.
 * Uses releaseInProgressRef to avoid oscillation: once we project idle during release, we stay idle
 * until lifecycle leaves listening or user starts again (audioSessionState === 'listening').
 */
function effectiveMode(
  lifecycle: AgentOrchestratorState['lifecycle'],
  audioSessionState: AgentOrchestratorState['audioSessionState'],
  releaseInProgressRef: { current: boolean },
): 'idle' | 'listening' | 'processing' | 'speaking' {
  if (lifecycle !== 'listening') {
    releaseInProgressRef.current = false;
    return lifecycleToMode(lifecycle);
  }
  if (audioSessionState === 'stopping' || audioSessionState === 'settling') {
    releaseInProgressRef.current = true;
    return 'idle';
  }
  if (audioSessionState === 'listening' || audioSessionState === 'starting') {
    releaseInProgressRef.current = false;
    return 'listening';
  }
  // idleReady (or undefined): stay idle if we're in the release path to avoid listening→idle→listening
  return releaseInProgressRef.current ? 'idle' : 'listening';
}

export interface UseVisualizationControllerOptions {
  /** When true, do not push mode/phase so DevPanel/RuntimeLoop own mode. */
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

  const dummySignalsRef = useRef({
    phase: 'resolved' as const,
    grounded: true,
    confidence: 0.82,
    retrievalDepth: 3,
    cardRefsCount: 2,
  });

  // Populate listeners so orchestrator can drive pulses and semantic events
  useEffect(() => {
    perfTrace('VisualizationController', 'VisualizationController initialized');
    logInfo('VisualizationController', 'initialized');
    const ref = visualizationRef;
    const listeners = {
      onListeningStart: () => {},
      onListeningEnd: () => {},
      onTranscriptUpdate: () => {
        if (ref.current) triggerPulseAtCenter(ref);
      },
      onRequestStart: () => {},
      onRetrievalStart: () => {},
      onRetrievalEnd: () => {},
      onGenerationStart: () => {},
      onFirstToken: () => {
        logInfo('VisualizationController', 'emitted transient: firstToken');
        emitEventRef.current(TRANSIENT_SIGNAL_FIRST_TOKEN);
      },
      onGenerationEnd: () => {
        traceLateProcessingVizUpdate(undefined, 'chunkAccepted_event', () => {
          logInfo('VisualizationController', 'emitted event: chunkAccepted');
          emitEventRef.current('chunkAccepted');
        });
      },
      onPlaybackStart: () => {},
      onPlaybackEnd: () => {},
      onComplete: () => {},
      onRecoverableFailure: () => {
        logInfo('VisualizationController', 'emitted transient: softFail');
        emitEventRef.current(TRANSIENT_SIGNAL_SOFT_FAIL);
      },
      onError: (_reason?: string, details?: Record<string, unknown>) => {
        if (details?.transientEvent === 'terminalFail') {
          logInfo('VisualizationController', 'emitted transient: terminalFail');
          emitEventRef.current(TRANSIENT_SIGNAL_TERMINAL_FAIL);
        }
      },
    };
    listenersRef.current = listeners;
    return () => {
      listenersRef.current = null;
    };
  }, [visualizationRef, listenersRef]);

  const attachedLoggedRef = useRef(false);
  const lastLoggedModeRef = useRef<string | null>(null);
  const lastLoggedLifecycleRef = useRef<string | null>(null);
  const lastLoggedSubstateRef = useRef<string | null>(null);
  /** Stabilizes projected mode during release: avoid listening→idle→listening when audioSessionState goes stopping→settling→idleReady. */
  const releaseInProgressRef = useRef(false);
  const prevLateVizSubRef = useRef<ProcessingSubstate | null>(null);

  // Map normalized agent state → visualization signals (mode, phase, grounded, etc.)
  useEffect(() => {
    if (debugScenario) {
      const withOptionalMode = <T extends object>(payload: T): T => {
        if (debugEnabled) {
          const stripped = {
            ...(payload as T & {
              mode?: string;
              phase?: string;
            }),
          };
          delete stripped.mode;
          delete stripped.phase;
          return stripped as T;
        }
        return payload as T;
      };
      setSignals(withOptionalMode(dummySignalsRef.current));
      return;
    }

    const mode = effectiveMode(state.lifecycle, state.audioSessionState, releaseInProgressRef);
    const phase =
      state.lifecycle === 'processing'
        ? 'processing'
        : state.lifecycle === 'speaking'
          ? 'resolved'
          : 'idle';

    if (lastLoggedLifecycleRef.current !== state.lifecycle) {
      lastLoggedLifecycleRef.current = state.lifecycle;
      logInfo('VisualizationController', `received lifecycle state ${state.lifecycle}`);
    }
    if (state.lifecycle === 'speaking') {
      perfTrace('VisualizationController', 'lifecycle speaking received', {
        mode,
        displayMode: visualizationRef.current?.displayMode ?? null,
      });
    }
    if (lastLoggedModeRef.current !== mode) {
      lastLoggedModeRef.current = mode;
      logInfo('VisualizationController', `mode changed to ${mode}`);
    }
    if (state.lifecycle === 'processing' && state.processingSubstate != null) {
      const substate = state.processingSubstate;
      if (lastLoggedSubstateRef.current !== substate) {
        lastLoggedSubstateRef.current = substate;
        logInfo('VisualizationController', `processingSubstate changed to ${substate}`);
      }
    } else {
      lastLoggedSubstateRef.current = null;
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

    const signalPayload = {
      phase: phase as 'idle' | 'processing' | 'resolved',
      grounded,
      confidence,
      retrievalDepth,
      cardRefsCount,
    };

    const prevLate = prevLateVizSubRef.current;
    const sub = state.processingSubstate;

    const withOptionalMode = <T extends object>(payload: T): T => {
      if (debugEnabled) {
        const stripped = {
          ...(payload as T & {
            mode?: string;
            phase?: string;
          }),
        };
        delete stripped.mode;
        delete stripped.phase;
        return stripped as T;
      }
      return { ...payload, mode } as T;
    };

    const finishAttached = () => {
      if (!attachedLoggedRef.current) {
        attachedLoggedRef.current = true;
        perfTrace('VisualizationController', 'attached to visualization signal pipeline');
        logInfo('VisualizationController', 'attached to visualization signal pipeline');
      }
    };

    if (state.lifecycle === 'processing' && sub === 'validating') {
      if (prevLate !== 'validating') {
        traceLateProcessingVizUpdate(undefined, 'processingSubstate_validating', () => {});
      }
      traceLateProcessingVizUpdate(undefined, 'visualization_signal_apply_validating', () => {
        setSignals(withOptionalMode(signalPayload));
      });
      prevLateVizSubRef.current = sub;
      finishAttached();
      return;
    }

    if (state.lifecycle === 'processing' && sub === 'settling') {
      if (prevLate !== 'settling') {
        traceLateProcessingVizUpdate(undefined, 'processingSubstate_settling', () => {});
      }
      traceLateProcessingVizUpdate(undefined, 'visualization_signal_apply_settling', () => {
        setSignals(withOptionalMode(signalPayload));
      });
      prevLateVizSubRef.current = sub;
      finishAttached();
      return;
    }

    prevLateVizSubRef.current = sub;

    if (mode === 'speaking') {
      perfTrace('Runtime', 'playback transition state decision', {
        requestId: undefined,
        skipPlaybackTransitionState: DIAG_SKIP_PLAYBACK_TRANSITION_STATE,
        op: 'visualization_speaking_transition',
      });
      if (DIAG_SKIP_PLAYBACK_TRANSITION_STATE) {
        perfTrace('Runtime', 'skipped playback transition state', {
          requestId: undefined,
          op: 'visualization_speaking_transition',
        });
      } else {
        perfTrace('VisualizationController', 'before applying visualization signals for speaking', {
          mode,
          phase,
        });
      }
    }
    setSignals(withOptionalMode(signalPayload));
    if (mode === 'speaking' && !DIAG_SKIP_PLAYBACK_TRANSITION_STATE) {
      perfTrace('VisualizationController', 'after applying visualization signals for speaking', {
        mode,
        phase,
      });
      perfTrace('Runtime', 'playback transition state executed', {
        requestId: undefined,
        op: 'visualization_speaking_transition',
      });
    }
    finishAttached();
  }, [
    state.lifecycle,
    state.audioSessionState,
    state.processingSubstate,
    state.validationSummary,
    setSignals,
    debugEnabled,
    debugScenario,
    DIAG_SKIP_PLAYBACK_TRANSITION_STATE,
    DIAG_SKIP_LATE_PROCESSING_VIZ_UPDATES,
  ]);
}
