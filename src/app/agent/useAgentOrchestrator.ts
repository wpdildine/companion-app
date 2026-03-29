/**
 * AgentOrchestrator: single source of truth for agent lifecycle.
 * Owns voice input, request, retrieval/generation, playback, cancellation.
 * Does not know visualization, panel layout, or render-layer details.
 * Emits normalized state and optional listener callbacks for VisualizationController.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  NativeModules,
  Platform,
  type AppStateStatus,
} from 'react-native';
import {
  copyBundlePackToDocuments,
  createBundlePackReader,
  createDocumentsPackReader,
  createThrowReader,
  getContentPackPathInDocuments,
  getPackEmbedModelId,
  getPackState,
  type ValidationSummary,
} from '../../rag';
import {
  getEndpointBaseUrl,
  getSttProvider,
  isRemoteWithLocalFallbackStt,
  snapshotSttResolution,
  type SttProvider,
} from '../../shared/config/endpointConfig';
import { getSttOverrideStoreSnapshot } from '../../shared/config/sttDevOverride';
import {
  isLogGateEnabled,
  logError,
  logInfo,
  logLifecycle,
  logWarn,
} from '../../shared/logging';
import {
  useSttAudioCapture,
  type CapturedSttAudio,
  type SttAudioCaptureFailureKind,
} from '../hooks/useSttAudioCapture';
import { useOpenAIProxy } from '../providers/openAI/useOpenAIProxy';
import {
  classifyRecoverableFailure,
  recoverableReasonKeyForFrontDoorVerdict,
} from './failureClassification';
import {
  projectContextArtifact,
  projectFailureArtifact,
  projectSettlementArtifact,
} from './orchestrator/artifactProjector';
import { committedResponseFromSemanticFrontDoor } from './orchestrator/frontDoorCommit';
import { resolveScriptedAnswerSlot } from './scripted/resolveScriptedAnswerSlot';
import {
  emitRequestDebug,
  type RequestDebugSinkRef,
} from './orchestrator/telemetry';
import { executeRequest } from './request/executeRequest';
import type { RequestDebugEmitPayload } from './requestDebugTypes';
import { appendSemanticEvidenceEvent } from './semanticEvidenceSink';
import { mirrorRequestIdentityFromRefs } from './semanticEvidenceMirror';
import type { ObservedEvent } from './semanticEvidenceTypes';
import type {
  AgentLifecycleState,
  AgentOrchestratorListeners,
  AgentOrchestratorState,
  LastFrontDoorOutcome,
  ProcessingSubstate,
} from './types';
import { createRemoteSttCoordinator } from './av/remoteStt';
import type { AvFact } from './av/avFacts';
import {
  cleanupPendingIosStopIfNeededMechanics,
  finishAvPlaybackLifecycleMechanics,
  runNativeStopWithLoggingMechanics,
  runRemoteStopFinalizeMechanics as runRemoteStopFinalizeMechanicsUnit,
  selectAvPlaybackRouteMechanics,
  selectAvStartRouteMechanics,
  startAvLocalVoiceListeningMechanics,
  startAvPlaybackLifecycleMechanics,
  startAvRemoteCaptureListeningMechanics,
  type AvPlaybackFact,
  type AvPlaybackRoute,
  type AvStartRoute,
  type RemoteStopFinalizeFact,
} from './av/avSurface';
import {
  createSessionCoordinator,
  type AudioSessionState,
} from './av/sessionCoordinator';
import {
  createTranscriptSettlementCoordinator,
  normalizeTranscript,
  transcriptPreview,
  type SettlementOutcome,
} from './orchestrator/transcriptSettlement';
import { getOnDeviceModelPaths } from './orchestrator/modelPaths';
import {
  blockWindowUntil,
  getVoiceNative,
  invokeVoiceStop,
  isRecognizerReentrancyError,
  isRecoverableSpeechError,
  NATIVE_RESTART_GUARD_MS,
  runNativeStopFlow,
} from './av/voiceNative';

/** Non-authoritative artifact projection; failures must not abort request completion. */
const ARTIFACT_PROJECTION_HELPER = 'extractIntentSignals';

/** Piper/native TurboModule rejection `code` when available. */
function readNativeErrorCode(e: unknown): string {
  if (
    e !== null &&
    typeof e === 'object' &&
    'code' in e &&
    typeof (e as { code: unknown }).code === 'string'
  ) {
    return (e as { code: string }).code;
  }
  return '';
}

/** At most one terminal fact per playback attempt id (handles deferred macrotasks vs new playText). */
function consumePlaybackTerminalSlot(
  awaiting: { current: Set<number> },
  attemptId: number,
): boolean {
  const s = awaiting.current;
  if (!s.has(attemptId)) return false;
  s.delete(attemptId);
  return true;
}

function emitContextArtifactDebug(
  sinkRef: RequestDebugSinkRef | null | undefined,
  base: { requestId: number; timestamp: number },
  project: () => ReturnType<typeof projectContextArtifact>,
): void {
  try {
    emitRequestDebug(sinkRef, {
      type: 'context_artifact_emitted',
      requestId: base.requestId,
      timestamp: base.timestamp,
      contextArtifact: project(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logWarn('AgentOrchestrator', 'artifact_projection_failed', {
      artifactKind: 'context',
      helper: ARTIFACT_PROJECTION_HELPER,
      message,
      requestId: base.requestId,
    });
    emitRequestDebug(sinkRef, {
      type: 'artifact_projection_failed',
      requestId: base.requestId,
      timestamp: base.timestamp,
      artifactKind: 'context',
      helper: ARTIFACT_PROJECTION_HELPER,
      message,
    });
  }
}

function emitSettlementArtifactDebug(
  sinkRef: RequestDebugSinkRef | null | undefined,
  base: { requestId: number; timestamp: number },
  project: () => ReturnType<typeof projectSettlementArtifact>,
): void {
  try {
    emitRequestDebug(sinkRef, {
      type: 'settlement_artifact_emitted',
      requestId: base.requestId,
      timestamp: base.timestamp,
      settlementArtifact: project(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logWarn('AgentOrchestrator', 'artifact_projection_failed', {
      artifactKind: 'settlement',
      helper: ARTIFACT_PROJECTION_HELPER,
      message,
      requestId: base.requestId,
    });
    emitRequestDebug(sinkRef, {
      type: 'artifact_projection_failed',
      requestId: base.requestId,
      timestamp: base.timestamp,
      artifactKind: 'settlement',
      helper: ARTIFACT_PROJECTION_HELPER,
      message,
    });
  }
}

function emitFailureArtifactDebug(
  sinkRef: RequestDebugSinkRef | null | undefined,
  base: { requestId: number; timestamp: number },
  project: () => ReturnType<typeof projectFailureArtifact>,
): void {
  try {
    emitRequestDebug(sinkRef, {
      type: 'failure_artifact_emitted',
      requestId: base.requestId,
      timestamp: base.timestamp,
      failureArtifact: project(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logWarn('AgentOrchestrator', 'artifact_projection_failed', {
      artifactKind: 'failure',
      helper: ARTIFACT_PROJECTION_HELPER,
      message,
      requestId: base.requestId,
    });
    emitRequestDebug(sinkRef, {
      type: 'artifact_projection_failed',
      requestId: base.requestId,
      timestamp: base.timestamp,
      artifactKind: 'failure',
      helper: ARTIFACT_PROJECTION_HELPER,
      message,
    });
  }
}

/** Proxy / orchestrator failure codes that arm next-listen local preference (remote_with_local_fallback only). */
const NEXT_LISTEN_LOCAL_PREFERENCE_CODES = new Set([
  'E_BASE_URL',
  'E_TIMEOUT',
  'E_PROXY',
  'E_JSON',
  'E_NETWORK',
]);

type RemoteSttFailureMeta = { code?: string; mechanismReason?: string };

function shouldSetNextListenLocalPreference(
  sttProvider: SttProvider,
  meta?: RemoteSttFailureMeta,
): boolean {
  if (!isRemoteWithLocalFallbackStt(sttProvider)) return false;
  if (meta?.mechanismReason === 'orchestrator_stt_settle_timeout') {
    return true;
  }
  const code = meta?.code;
  return code != null && NEXT_LISTEN_LOCAL_PREFERENCE_CODES.has(code);
}

type VoiceModule = {
  start: (locale: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
  removeAllListeners: () => void;
  onSpeechResults: ((e: { value?: string[] }) => void) | null;
  onSpeechPartialResults: ((e: { value?: string[] }) => void) | null;
  onSpeechError: ((e: { error?: { message?: string } }) => void) | null;
  onSpeechEnd: (() => void) | null;
};

type TtsModule = {
  getInitStatus: () => Promise<void>;
  speak: (text: string, options?: object) => void;
  stop: () => void;
  addEventListener: (event: string, handler: () => void) => void;
  removeEventListener: (event: string, handler: () => void) => void;
};

type SurfacedFailureSeverity = 'recoverable' | 'terminal';

type SessionFailureLedgerEntry = {
  strongest: SurfacedFailureSeverity;
  recoverableSurfaced: boolean;
  terminalSurfaced: boolean;
};

/** Sink for request-scoped debug telemetry: (payload) => void. Payload must include type and requestId. */
export type RequestDebugSink = (
  payload: RequestDebugEmitPayload & { type: string },
) => void;

export interface UseAgentOrchestratorOptions {
  /** Optional ref to listeners; orchestrator will call these on lifecycle events. */
  listenersRef?: React.RefObject<AgentOrchestratorListeners | null>;
  /** Optional ref to request-debug sink; orchestrator will emit lifecycle events here. */
  requestDebugSinkRef?: React.RefObject<RequestDebugSink | null>;
  /**
   * Optional append-only buffer mirroring listener fanout (read-only projection).
   * Suppressed failures that skip listeners also skip appends.
   */
  semanticEvidenceEventsRef?: React.MutableRefObject<ObservedEvent[]>;
}

export interface AgentOrchestratorActions {
  startListening: (
    fresh?: boolean,
  ) => Promise<{ ok: boolean; reason?: string }>;
  stopListening: () => Promise<void>;
  /** For hold-to-speak release: stop and request submit only after transcript settlement. Submit must be triggered via onTranscriptReadyForSubmit. */
  stopListeningAndRequestSubmit: () => Promise<void>;
  submit: () => Promise<string | null>;
  playText: (text: string) => Promise<void>;
  cancelPlayback: () => void;
  setTranscribedText: (text: string) => void;
  clearError: () => void;
  reportRecoverableFailure: (
    reason: string,
    details?: Record<string, unknown>,
  ) => void;
  /** Single recovery path: clear finalization/request state, return to idle, stop listening if active. Call on dismiss error. */
  recoverFromRequestFailure: () => void;
}

export function useAgentOrchestrator(
  options: UseAgentOrchestratorOptions = {},
): { state: AgentOrchestratorState; actions: AgentOrchestratorActions } {
  const { listenersRef, requestDebugSinkRef, semanticEvidenceEventsRef } =
    options;

  const appendOrchEvidenceRef = useRef<
    (kind: string, payload?: Record<string, unknown>) => void
  >(() => {});
  appendOrchEvidenceRef.current = (kind, payload) => {
    appendSemanticEvidenceEvent(semanticEvidenceEventsRef, {
      kind,
      source: 'orchestrator',
      payload,
    });
  };

  /** Set only from `snapshotSttResolution()` at `startListening` entry — not mount (avoids stale env-only mode before override applies). */
  const sessionSttProviderRef = useRef<SttProvider | null>(null);
  const sessionSttOverrideAppliedRef = useRef<boolean | null>(null);
  const endpointBaseUrl = getEndpointBaseUrl();
  const { transcribeAudio } = useOpenAIProxy();
  const sttAudioCapture = useSttAudioCapture();

  const [mode, setMode] = useState<
    'idle' | 'listening' | 'processing' | 'speaking'
  >('idle');
  const [lifecycle, setLifecycle] = useState<AgentLifecycleState>('idle');
  const [processingSubstate, setProcessingSubstate] =
    useState<ProcessingSubstate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [responseText, setResponseText] = useState<string | null>(null);
  const [validationSummary, setValidationSummary] =
    useState<ValidationSummary | null>(null);
  const [piperAvailable, setPiperAvailable] = useState<boolean | null>(null);
  const [ioBlockedUntil, setIoBlockedUntil] = useState<number | null>(null);
  const [ioBlockedReason, setIoBlockedReason] = useState<string | null>(null);
  const [audioSessionState, setAudioSessionState] =
    useState<AudioSessionState>('idleReady');
  const [lastFrontDoorOutcome, setLastFrontDoorOutcome] =
    useState<LastFrontDoorOutcome | null>(null);

  const voiceRef = useRef<VoiceModule | null>(null);
  const ttsRef = useRef<TtsModule | null>(null);
  const transcribedTextRef = useRef('');
  const responseTextRef = useRef<string | null>(responseText);
  const validationSummaryRef = useRef<ValidationSummary | null>(
    validationSummary,
  );
  const committedTextRef = useRef('');
  const partialTranscriptRef = useRef('');
  const speechEndedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const modeRef = useRef(mode);
  const lifecycleRef = useRef(lifecycle);
  const playbackInterruptedRef = useRef(false);
  /** Monotonic id per `playText` entry; deferred handlers ignore stale attempts. */
  const playbackAttemptSeqRef = useRef(0);
  /** Set for the in-flight attempt until a terminal playback fact is applied. */
  const playbackInflightAttemptIdRef = useRef<number | null>(null);
  /** Attempt ids expecting exactly one terminal `av.playback.*` end fact. */
  const playbackAwaitingTerminalRef = useRef<Set<number>>(new Set());
  const activePlaybackProviderRef = useRef<AvPlaybackRoute | null>(null);
  const lastRemoteSttEmptyRef = useRef(false);
  /**
   * Next-listen local preference (not same-utterance recovery): set after eligible remote transcribe
   * failures when session resolved mode is `remote_with_local_fallback`. Cleared once when local listen
   * starts with `clearedNextListenPreference` (after successful Voice.start). At most one preference
   * arm per failed remote transcribe; `remote_only` never reads this ref.
   */
  const nextListenLocalPreferenceRef = useRef(false);
  /** Which capture path is active for this listen session (`remote` = expo capture + proxy). */
  const listenSttPathRef = useRef<'remote' | 'local'>('local');
  /** Final safety net: if remote STT await never resolves, exit settling after this. */
  const ORCHESTRATOR_STT_SETTLE_TIMEOUT_MS = 7000;
  const requestIdRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const activeRequestIdRef = useRef(0);
  /** Tracks whether onFirstToken was fired for the current request (streaming); must not refire on late chunks. */
  /** RequestId for the request whose response is currently playing (for tts_start/tts_end). */
  const playbackRequestIdRef = useRef<number | null>(null);

  const recordingSessionRef = useRef<string | null>(null);
  const recordingSessionSeqRef = useRef(0);
  const pendingCapturedAudioRef = useRef<CapturedSttAudio | null>(null);
  const sessionFailureLedgerRef = useRef(
    new Map<string, SessionFailureLedgerEntry>(),
  );
  const recordingStartAtRef = useRef<number | null>(null);
  const firstPartialAtRef = useRef<number | null>(null);
  const firstFinalAtRef = useRef<number | null>(null);
  const lastPartialNormalizedRef = useRef('');
  const playTextRef = useRef<(text: string) => Promise<void>>(null);
  const ioBlockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPlaybackCompleteRef = useRef<{
    requestId: number;
    endedAt: number;
    playbackOutcome: 'completed' | 'cancelled' | 'failed';
  } | null>(null);
  const previousCommittedResponseRef = useRef<string | null>(null);
  const previousCommittedValidationRef = useRef<ValidationSummary | null>(null);
  const prevLifecycleRef = useRef<AgentLifecycleState>(lifecycle);
  modeRef.current = mode;
  lifecycleRef.current = lifecycle;

  const playListenIn = useCallback(() => {
    logInfo('AgentOrchestrator', 'voice listen started');
    listenersRef?.current?.onListeningStart?.();
    appendOrchEvidenceRef.current('onListeningStart');
  }, [listenersRef]);
  const playListenOut = useCallback(() => {
    logInfo('AgentOrchestrator', 'voice listen stopped');
  }, []);
  const playError = useCallback(() => {
    listenersRef?.current?.onError?.();
    appendOrchEvidenceRef.current('onError', { reason: undefined });
  }, [listenersRef]);
  const getFailureLedgerKey = useCallback(
    (recordingSessionId?: string) =>
      recordingSessionId ?? recordingSessionRef.current ?? null,
    [],
  );
  const updateSessionFailureLedger = useCallback(
    (
      recordingSessionId: string | undefined,
      severity: SurfacedFailureSeverity,
    ) => {
      const key = getFailureLedgerKey(recordingSessionId);
      if (!key) {
        return {
          shouldSurface: true,
          suppressedBy: undefined as SurfacedFailureSeverity | undefined,
        };
      }
      const ledger = sessionFailureLedgerRef.current;
      const current = ledger.get(key) ?? {
        strongest: severity,
        recoverableSurfaced: false,
        terminalSurfaced: false,
      };
      let shouldSurface = true;
      let suppressedBy: SurfacedFailureSeverity | undefined;

      if (severity === 'recoverable') {
        if (current.terminalSurfaced) {
          shouldSurface = false;
          suppressedBy = 'terminal';
        } else if (current.recoverableSurfaced) {
          shouldSurface = false;
          suppressedBy = 'recoverable';
        } else {
          current.recoverableSurfaced = true;
        }
      } else {
        if (current.terminalSurfaced) {
          shouldSurface = false;
          suppressedBy = 'terminal';
        } else {
          current.terminalSurfaced = true;
        }
      }

      if (severity === 'terminal' || current.strongest !== 'terminal') {
        current.strongest = severity;
      }
      ledger.set(key, current);
      if (ledger.size > 24) {
        const oldestKey = ledger.keys().next().value;
        if (typeof oldestKey === 'string') {
          ledger.delete(oldestKey);
        }
      }
      return { shouldSurface, suppressedBy };
    },
    [getFailureLedgerKey],
  );
  const emitRecoverableFailure = useCallback(
    (reason: string, details?: Record<string, unknown>) => {
      const classification = classifyRecoverableFailure(reason);
      const recordingSessionId =
        typeof details?.recordingSessionId === 'string'
          ? details.recordingSessionId
          : undefined;
      const ledgerDecision = updateSessionFailureLedger(
        recordingSessionId,
        'recoverable',
      );
      if (!ledgerDecision.shouldSurface) {
        logInfo(
          'AgentOrchestrator',
          'recoverable failure suppressed for session',
          {
            recordingSessionId,
            reason: classification.telemetryReason,
            suppressedBy: ledgerDecision.suppressedBy,
          },
        );
        return;
      }
      listenersRef?.current?.onRecoverableFailure?.(classification.kind, {
        ...details,
        stage: classification.stage,
        recoverability: classification.recoverability,
        transientEvent: classification.transientEvent,
        telemetryReason: classification.telemetryReason,
      });
      const requestId = activeRequestIdRef.current;
      appendOrchEvidenceRef.current('onRecoverableFailure', {
        reason: classification.kind,
        requestId: requestId !== 0 ? requestId : undefined,
        telemetryReason: classification.telemetryReason,
        stage: classification.stage,
        recoverability: classification.recoverability,
        transientEvent: classification.transientEvent,
        ...details,
      });
      emitRequestDebug(requestDebugSinkRef, {
        type: 'recoverable_failure',
        requestId: requestId !== 0 ? requestId : null,
        reason: classification.telemetryReason,
        timestamp: Date.now(),
      });
    },
    [listenersRef, requestDebugSinkRef, updateSessionFailureLedger],
  );
  const emitTerminalFailure = useCallback(
    (
      reason: string,
      details?: Record<string, unknown>,
      opts?: { allowAfterRecoverable?: boolean },
    ) => {
      const recordingSessionId =
        typeof details?.recordingSessionId === 'string'
          ? details.recordingSessionId
          : undefined;
      const ledgerDecision = updateSessionFailureLedger(
        recordingSessionId,
        'terminal',
      );
      if (!ledgerDecision.shouldSurface) {
        logInfo(
          'AgentOrchestrator',
          'terminal failure suppressed for session',
          {
            recordingSessionId,
            reason,
            suppressedBy: ledgerDecision.suppressedBy,
          },
        );
        return false;
      }
      if (
        ledgerDecision.suppressedBy == null ||
        opts?.allowAfterRecoverable !== false
      ) {
        listenersRef?.current?.onError?.(reason, {
          ...details,
          transientEvent: 'terminalFail',
        });
        appendOrchEvidenceRef.current('onError', {
          reason,
          transientEvent: 'terminalFail',
          requestId:
            activeRequestIdRef.current !== 0
              ? activeRequestIdRef.current
              : undefined,
          ...details,
        });
      }
      return true;
    },
    [listenersRef, updateSessionFailureLedger],
  );

  const onAudioStateChange = useCallback(
    (prev: AudioSessionState, next: AudioSessionState, context?: object) => {
      setAudioSessionState(next);
      logInfo('AgentOrchestrator', 'audio session transition', {
        from: prev,
        to: next,
        ...context,
      });
      if (next === 'listening') {
        setMode('listening');
        setLifecycle('listening');
      } else if (next === 'idleReady') {
        if (modeRef.current === 'listening') setMode('idle');
        if (
          lifecycleRef.current === 'listening' ||
          lifecycleRef.current === 'idle'
        ) {
          setProcessingSubstate(null);
          setLifecycle('idle');
        }
      }
    },
    [],
  );

  const sessionCoordinator = useMemo(
    () => createSessionCoordinator({ onAudioStateChange }),
    [onAudioStateChange],
  );

  const setAudioState = useCallback(
    (
      next: 'idleReady' | 'starting' | 'listening' | 'stopping' | 'settling',
      context?: object,
    ) => {
      sessionCoordinator.setAudioState(next, context);
    },
    [sessionCoordinator],
  );

  const applyIoBlock = useCallback((reason: string) => {
    const until = blockWindowUntil(Date.now());
    setIoBlockedUntil(until);
    setIoBlockedReason(reason);
    if (ioBlockedTimerRef.current) {
      clearTimeout(ioBlockedTimerRef.current);
    }
    ioBlockedTimerRef.current = setTimeout(() => {
      ioBlockedTimerRef.current = null;
      setIoBlockedUntil(null);
      setIoBlockedReason(null);
    }, Math.max(0, until - Date.now()));
  }, []);

  const clearIoBlock = useCallback(() => {
    if (ioBlockedTimerRef.current) {
      clearTimeout(ioBlockedTimerRef.current);
      ioBlockedTimerRef.current = null;
    }
    setIoBlockedUntil(null);
    setIoBlockedReason(null);
  }, []);

  const updateTranscript = useCallback((next: string) => {
    transcribedTextRef.current = next;
    setTranscribedText(next);
  }, []);

  const failRemoteStt = useCallback(
    (
      message: string,
      recordingSessionId?: string,
      meta?: RemoteSttFailureMeta,
    ) => {
      pendingCapturedAudioRef.current = null;
      const preferred =
        sessionSttProviderRef.current ?? snapshotSttResolution().provider;
      const preferenceSet = shouldSetNextListenLocalPreference(preferred, meta);
      logInfo('AgentOrchestrator', 'stt fallback evaluation', {
        sessionProvider: preferred,
        shouldFallback: preferenceSet,
      });
      if (preferenceSet) {
        nextListenLocalPreferenceRef.current = true;
        logInfo('AgentOrchestrator', 'stt next-listen local preference set', {
          recordingSessionId,
          stt_preferred_mode: preferred,
          stt_override_applied: sessionSttOverrideAppliedRef.current ?? false,
          stt_env_mode: getSttProvider(),
          stt_next_listen_local_preference_set: true,
          stt_mechanism_reason_class:
            meta?.mechanismReason ?? meta?.code ?? 'proxy_transport',
        });
      }
      setAudioState('idleReady', {
        recordingSessionId,
        reason: 'sttProxyFailed',
      });
      setError(message);
      setProcessingSubstate(null);
      setMode('idle');
      setLifecycle('error');
      emitTerminalFailure('sttProxyFailed', {
        recordingSessionId,
        message,
        sttProvider: preferred,
        endpointBaseUrl: endpointBaseUrl ?? null,
        stt_next_listen_local_preference_set: preferenceSet,
      });
      logError('AgentOrchestrator', 'remote stt transcription failed', {
        recordingSessionId,
        message,
        sttProvider: preferred,
        endpointBaseUrl: endpointBaseUrl ?? null,
        stt_next_listen_local_preference_set: preferenceSet,
      });
    },
    [emitTerminalFailure, endpointBaseUrl, setAudioState],
  );
  const handleLocalCaptureFailure = useCallback(
    (
      failureKind: SttAudioCaptureFailureKind,
      message: string,
      recordingSessionId?: string,
    ) => {
      pendingCapturedAudioRef.current = null;
      logWarn('AgentOrchestrator', 'remote stt audio capture failed', {
        recordingSessionId,
        failureKind,
        message,
      });
      emitRecoverableFailure('speechCaptureFailed', {
        recordingSessionId,
        captureFailureKind: failureKind,
        message,
      });
      setAudioState('idleReady', {
        recordingSessionId,
        reason: failureKind,
      });
    },
    [emitRecoverableFailure, setAudioState],
  );
  const reportRecoverableFailure = useCallback(
    (reason: string, details?: Record<string, unknown>) => {
      emitRecoverableFailure(reason, {
        ...details,
        recordingSessionId:
          typeof details?.recordingSessionId === 'string'
            ? details.recordingSessionId
            : recordingSessionRef.current ?? undefined,
      });
    },
    [emitRecoverableFailure],
  );

  const applyTranscriptForRemoteStt = useCallback(
    (normalizedText: string) => {
      committedTextRef.current = normalizedText;
      partialTranscriptRef.current = '';
      updateTranscript(normalizedText);
    },
    [updateTranscript],
  );

  const remoteSttCoordinator = useMemo(
    () =>
      createRemoteSttCoordinator({
        getPendingCapture: () => pendingCapturedAudioRef.current,
        clearPendingCapture: () => {
          pendingCapturedAudioRef.current = null;
        },
        applyTranscript: applyTranscriptForRemoteStt,
        transcribeAudio,
        getEndpointBaseUrl: () => endpointBaseUrl ?? null,
        onFailure: (msg, sid, meta) => failRemoteStt(msg, sid, meta),
        onEmptyTranscript: () => {
          lastRemoteSttEmptyRef.current = true;
        },
      }),
    [
      applyTranscriptForRemoteStt,
      failRemoteStt,
      transcribeAudio,
      endpointBaseUrl,
    ],
  );

  const transcribeCapturedAudioIfNeeded = useCallback(
    async (recordingSessionId?: string): Promise<boolean> => {
      if (listenSttPathRef.current !== 'remote') return true;
      return remoteSttCoordinator.transcribeCapturedAudioIfNeeded(
        recordingSessionId,
      );
    },
    [remoteSttCoordinator],
  );

  useEffect(() => {
    responseTextRef.current = responseText;
  }, [responseText]);

  useEffect(() => {
    validationSummaryRef.current = validationSummary;
  }, [validationSummary]);

  const finalizeTranscriptFromPartial = useCallback(
    (reason: string, recordingSessionId?: string) => {
      const partial = partialTranscriptRef.current.trim();
      if (!partial) return;
      const fallback = normalizeTranscript(partial);
      if (!fallback) return;
      const current = normalizeTranscript(transcribedTextRef.current);
      if (current.length >= fallback.length) return;
      committedTextRef.current = fallback;
      updateTranscript(fallback);
      logInfo(
        'AgentOrchestrator',
        'transcript final synthesized from partial',
        {
          recordingSessionId,
          totalChars: fallback.length,
          transcriptText: fallback,
          transcriptPreview: transcriptPreview(fallback),
          reason,
        },
      );
    },
    [updateTranscript],
  );

  const onSettlementFinalizeComplete = useCallback(
    (opts?: { keepLifecycle?: boolean }) => {
      recordingSessionRef.current = null;
      partialTranscriptRef.current = '';
      speechEndedRef.current = false;
      stopRequestedRef.current = false;
      pendingCapturedAudioRef.current = null;
      if (!opts?.keepLifecycle) {
        setProcessingSubstate(null);
        setMode('idle');
        setLifecycle('idle');
      }
    },
    [],
  );

  const settlementCoordinator = useMemo(
    () =>
      createTranscriptSettlementCoordinator({
        getPartialTranscript: () => partialTranscriptRef.current,
        getTranscribedText: () => transcribedTextRef.current,
        updateTranscript,
        getSpeechEnded: () => speechEndedRef.current,
        getRecordingSessionId: () => recordingSessionRef.current,
        finalizeTranscriptFromPartial,
        emitRecoverableFailure,
        transcribeCapturedAudioIfNeeded,
      }),
    [
      updateTranscript,
      finalizeTranscriptFromPartial,
      emitRecoverableFailure,
      transcribeCapturedAudioIfNeeded,
    ],
  );

  const finalizeStop = useCallback(
    (
      reason: string,
      recordingSessionId?: string,
      opts?: { keepLifecycle?: boolean },
    ) => {
      settlementCoordinator.finalizeStop(reason, recordingSessionId);
      listenersRef?.current?.onListeningEnd?.();
      appendOrchEvidenceRef.current('onListeningEnd', {
        recordingSessionId,
        reason,
      });
      onSettlementFinalizeComplete(opts);
      logInfo('AgentOrchestrator', 'voice listen stopped', {
        recordingSessionId,
      });
    },
    [listenersRef, onSettlementFinalizeComplete, settlementCoordinator],
  );

  const applyAvFact = useCallback(
    (fact: AvFact) => {
      if (fact.kind === 'av.session.transitioned') {
        setAudioState(fact.next, {
          recordingSessionId: fact.recordingSessionId,
          reason: fact.mechanicalReason,
        });
        return;
      }
      if (fact.kind === 'av.playback.started') {
        setProcessingSubstate(null);
        setMode('speaking');
        setLifecycle('speaking');
        emitRequestDebug(requestDebugSinkRef, {
          type: 'tts_start',
          requestId: fact.requestId ?? null,
          ttsStartedAt: fact.at,
          timestamp: fact.at,
          lifecycle: 'speaking',
        });
        listenersRef?.current?.onPlaybackStart?.();
        appendOrchEvidenceRef.current('onPlaybackStart', {
          requestId: fact.requestId ?? undefined,
        });
        return;
      }
      if (
        fact.kind === 'av.playback.completed' ||
        fact.kind === 'av.playback.cancelled' ||
        fact.kind === 'av.playback.failed'
      ) {
        const playbackOutcome: 'completed' | 'cancelled' | 'failed' =
          fact.kind === 'av.playback.cancelled'
            ? 'cancelled'
            : fact.kind === 'av.playback.failed'
              ? 'failed'
              : 'completed';
        emitRequestDebug(requestDebugSinkRef, {
          type: 'tts_end',
          requestId: fact.requestId ?? null,
          ttsEndedAt: fact.at,
          timestamp: fact.at,
          lifecycle: playbackOutcome === 'failed' ? 'error' : 'idle',
          playbackOutcome,
        });
        if (fact.requestId != null) {
          pendingPlaybackCompleteRef.current = {
            requestId: fact.requestId,
            endedAt: fact.at,
            playbackOutcome,
          };
        }
        playbackRequestIdRef.current = null;
        playbackInflightAttemptIdRef.current = null;
        setProcessingSubstate(null);
        setMode('idle');
        if (fact.kind === 'av.playback.failed') {
          setLifecycle('error');
          setError(fact.details?.message ?? 'Playback failed');
        } else {
          setLifecycle('idle');
        }
        setAudioState('idleReady', {
          reason:
            fact.kind === 'av.playback.cancelled'
              ? 'playbackCancelled'
              : fact.kind === 'av.playback.failed'
                ? 'playbackFailed'
                : 'playbackComplete',
        });
        if (fact.kind === 'av.playback.cancelled') {
          logInfo('AgentOrchestrator', 'playback cancelled');
        } else if (fact.kind === 'av.playback.failed') {
          logInfo('AgentOrchestrator', 'playback failed');
        } else {
          logInfo('AgentOrchestrator', 'playback completed');
        }
        listenersRef?.current?.onPlaybackEnd?.();
        appendOrchEvidenceRef.current('onPlaybackEnd', {
          requestId: fact.requestId ?? undefined,
          kind: fact.kind,
        });
        return;
      }
      if (fact.kind === 'av.bookkeeping.next_listen_local_preference_cleared') {
        nextListenLocalPreferenceRef.current = false;
        return;
      }
      if (fact.kind === 'av.bookkeeping.listen_path') {
        listenSttPathRef.current = fact.listenPath;
        return;
      }
      if (fact.kind === 'av.bookkeeping.recording_session_id') {
        recordingSessionRef.current = fact.sessionId;
        return;
      }
      if (fact.kind === 'av.bookkeeping.speech_ended') {
        speechEndedRef.current = fact.value;
        return;
      }
      if (fact.kind === 'av.bookkeeping.io_block_cleared') {
        clearIoBlock();
        return;
      }
      if (fact.kind === 'av.bookkeeping.listen_in_signal') {
        playListenIn();
        return;
      }
      if (fact.kind === 'av.bookkeeping.pending_captured_audio_set') {
        pendingCapturedAudioRef.current = fact.capture;
        return;
      }
      if (fact.kind === 'av.bookkeeping.remote_stt_empty_flag') {
        lastRemoteSttEmptyRef.current = fact.value;
        return;
      }
      if (fact.kind === 'av.capture.failed') {
        handleLocalCaptureFailure(
          fact.failureKind as SttAudioCaptureFailureKind,
          fact.message,
          fact.recordingSessionId,
        );
        finalizeStop('remoteCaptureFailed', fact.recordingSessionId);
        return;
      }
      if (fact.kind === 'av.stt.timeout') {
        logWarn(
          'AgentOrchestrator',
          'orchestrator-level STT settle timeout fired',
          {
            recordingSessionId: fact.recordingSessionId,
            timeoutMs: ORCHESTRATOR_STT_SETTLE_TIMEOUT_MS,
          },
        );
        failRemoteStt(
          'Remote STT request timed out (orchestrator)',
          fact.recordingSessionId,
          { mechanismReason: 'orchestrator_stt_settle_timeout' },
        );
        finalizeStop('remoteSttFailed', fact.recordingSessionId, {
          keepLifecycle: true,
        });
        return;
      }
      if (fact.kind === 'av.stt.unavailable') {
        if (fact.emptyTranscript) {
          emitRecoverableFailure('noUsableTranscript', {
            recordingSessionId: fact.recordingSessionId,
            reason: 'remoteSttEmptyTranscript',
          });
          setAudioState('idleReady', {
            recordingSessionId: fact.recordingSessionId,
            reason: 'remoteSttEmptyTranscript',
          });
          finalizeStop('remoteSttEmptyTranscript', fact.recordingSessionId);
        } else {
          finalizeStop('remoteSttFailed', fact.recordingSessionId, {
            keepLifecycle: true,
          });
        }
        return;
      }
      if (fact.kind === 'av.stt.completed') {
        logInfo(
          'AgentOrchestrator',
          'submit triggered after remote stt capture',
          {
            recordingSessionId: fact.recordingSessionId,
            stt_preferred_mode:
              sessionSttProviderRef.current ?? snapshotSttResolution().provider,
            stt_override_applied: sessionSttOverrideAppliedRef.current ?? false,
            stt_env_mode: getSttProvider(),
          },
        );
        listenersRef?.current?.onTranscriptReadyForSubmit?.();
        appendOrchEvidenceRef.current('onTranscriptReadyForSubmit', {
          recordingSessionId: fact.recordingSessionId,
        });
        setAudioState('settling', {
          recordingSessionId: fact.recordingSessionId,
          reason: 'remoteTranscriptReady',
        });
        finalizeStop('remoteSttSubmitReady', fact.recordingSessionId, {
          keepLifecycle: true,
        });
      }
    },
    [
      clearIoBlock,
      emitRecoverableFailure,
      failRemoteStt,
      finalizeStop,
      getSttProvider,
      handleLocalCaptureFailure,
      listenersRef,
      playListenIn,
      requestDebugSinkRef,
      setAudioState,
    ],
  );

  const emitAvFact = useCallback(
    (fact: AvFact) => {
      applyAvFact(fact);
    },
    [applyAvFact],
  );

  const cleanupPendingIosStopIfNeeded = useCallback(
    async (
      recordingSessionId?: string,
      nextAudioState: 'idleReady' | 'settling' = 'idleReady',
    ) => {
      await cleanupPendingIosStopIfNeededMechanics({
        recordingSessionId,
        nextAudioState,
        platformIsIos: Platform.OS === 'ios',
        getIosStopPending: sessionCoordinator.getIosStopPending,
        getIosStopInvoked: sessionCoordinator.getIosStopInvoked,
        emitAvFact,
        invokeStop: () => invokeVoiceStop(voiceRef.current, getVoiceNative),
        setIosStopPending: sessionCoordinator.setIosStopPending,
        setIosStopInvoked: sessionCoordinator.setIosStopInvoked,
        logInfo,
      });
    },
    [emitAvFact, sessionCoordinator],
  );

  const handleSettlementOutcome = useCallback(
    async (
      outcome: SettlementOutcome,
      reason: string,
      recordingSessionId?: string,
    ) => {
      if (outcome.kind === 'recoverable_empty') {
        logLifecycle(
          'AgentOrchestrator',
          'lifecycle transition listening -> idle',
          {
            recordingSessionId,
            reason: 'speech capture failed: no usable transcript',
          },
        );
        setAudioState('idleReady', {
          recordingSessionId,
          reason: outcome.failureReason,
        });
        await cleanupPendingIosStopIfNeeded(recordingSessionId, 'idleReady');
        finalizeStop(reason, recordingSessionId, { keepLifecycle: true });
        return;
      }
      if (outcome.kind === 'ignored') {
        return;
      }
      if (outcome.kind === 'stt_failed') {
        finalizeStop(reason, recordingSessionId, { keepLifecycle: true });
        return;
      }
      logInfo(
        'AgentOrchestrator',
        'submit triggered after transcript settlement',
        {
          reason,
          recordingSessionId,
        },
      );
      logInfo('AgentOrchestrator', 'settlement resolved; restart eligible', {
        recordingSessionId,
        pendingSubmitWhenReady: outcome.shouldSubmit,
        settlementResolved: settlementCoordinator.getSettlementResolved(),
      });
      const readySubmit = outcome.kind === 'ready' && outcome.shouldSubmit;
      if (readySubmit) {
        finalizeStop(reason, recordingSessionId, { keepLifecycle: true });
        listenersRef?.current?.onTranscriptReadyForSubmit?.();
        appendOrchEvidenceRef.current('onTranscriptReadyForSubmit', {
          recordingSessionId,
          reason,
        });
      }
      const nextAudioState = outcome.shouldSubmit ? 'settling' : 'idleReady';
      setAudioState(nextAudioState, {
        recordingSessionId,
        reason: 'settlementResolved',
      });
      await cleanupPendingIosStopIfNeeded(recordingSessionId, nextAudioState);
      if (!readySubmit) {
        finalizeStop(
          reason,
          recordingSessionId,
          outcome.shouldSubmit ? { keepLifecycle: true } : undefined,
        );
      }
    },
    [
      cleanupPendingIosStopIfNeeded,
      finalizeStop,
      listenersRef,
      setAudioState,
      settlementCoordinator,
    ],
  );

  const resolveSettlement = useCallback(
    async (reason: string, recordingSessionId?: string) => {
      const outcome = await settlementCoordinator.resolveSettlement(
        reason,
        recordingSessionId,
      );
      await handleSettlementOutcome(outcome, reason, recordingSessionId);
    },
    [handleSettlementOutcome, settlementCoordinator],
  );

  const runNativeStopWithLogging = useCallback(
    (
      recordingSessionId: string | undefined,
      runStop: () => Promise<void>,
      pendingSubmitWhenReady: boolean,
    ): Promise<void> => {
      return runNativeStopWithLoggingMechanics({
        recordingSessionId,
        runStop,
        pendingSubmitWhenReady,
        platformIsIos: Platform.OS === 'ios',
        executeNativeStopWithGrace:
          sessionCoordinator.executeNativeStopWithGrace,
        logInfo,
      });
    },
    [sessionCoordinator],
  );

  // ===== AV isolation: backend arbitration + capture start mechanics (facts only) =====
  const selectAvStartRoute = useCallback(
    (opts: {
      sttProvider: SttProvider;
      hasVoiceModule: boolean;
      endpointAvailable: boolean;
      nextListenLocalPreference: boolean;
    }): { route: AvStartRoute; fallbackReason?: string } => {
      return selectAvStartRouteMechanics(opts);
    },
    [],
  );

  const startAvLocalVoiceListening = useCallback(
    async (
      recordingSessionId: string,
      sttProvider: SttProvider,
      opts?: {
        clearedNextListenPreference?: boolean;
        startTimeFallbackReason?: string;
      },
    ) => {
      const voice = voiceRef.current;
      if (!voice) {
        throw new Error('Voice module unavailable');
      }
      await startAvLocalVoiceListeningMechanics({
        recordingSessionId,
        sttProvider,
        opts,
        startVoice: async () => {
          try {
            await voice.start('en-US');
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const nativeVoice = getVoiceNative();
            if (
              msg.toLowerCase().includes('startspeech is null') &&
              typeof nativeVoice?.startSpeech === 'function'
            ) {
              await nativeVoice.startSpeech('en-US');
              return;
            }
            throw e;
          }
        },
        emitAvFact,
        getSttProviderForLog: getSttProvider,
        getSessionSttOverrideApplied: () =>
          sessionSttOverrideAppliedRef.current ?? false,
        getRecordingStartAt: () => recordingStartAtRef.current,
        logInfo,
      });
    },
    [emitAvFact],
  );

  const startAvRemoteCaptureListening = useCallback(
    async (
      recordingSessionId: string,
      sttProvider: SttProvider,
    ): Promise<boolean> => {
      return startAvRemoteCaptureListeningMechanics({
        recordingSessionId,
        sttProvider,
        beginCapture: sttAudioCapture.beginCapture,
        emitAvFact,
        getSttProviderForLog: getSttProvider,
        getSessionSttOverrideApplied: () =>
          sessionSttOverrideAppliedRef.current ?? false,
        getRecordingStartAt: () => recordingStartAtRef.current,
        logInfo,
      });
    },
    [emitAvFact, sttAudioCapture],
  );

  // ===== AV isolation: playback command coordination mechanics =====
  const selectAvPlaybackRoute = useCallback((canUsePiper: boolean): AvPlaybackRoute => {
    return selectAvPlaybackRouteMechanics(canUsePiper);
  }, []);

  const startAvPlaybackLifecycle = useCallback(
    (provider: AvPlaybackRoute): AvPlaybackFact => {
      return startAvPlaybackLifecycleMechanics({
        provider,
        playbackRequestId: playbackRequestIdRef.current,
        activePlaybackProviderRef,
        isPlaybackHandoffLogEnabled: isLogGateEnabled('playbackHandoff'),
        logInfo,
      });
    },
    [],
  );

  const finishAvPlaybackLifecycle = useCallback(
    (
      endedAt: number,
      event: 'completed' | 'cancelled' | 'failed' = 'completed',
      failureMessage?: string,
    ): AvPlaybackFact => {
      return finishAvPlaybackLifecycleMechanics({
        endedAt,
        event,
        failureMessage,
        playbackRequestId: playbackRequestIdRef.current,
        activePlaybackProviderRef,
      });
    },
    [],
  );

  const runRemoteStopFinalizeMechanics = useCallback(
    async (recordingSessionId?: string): Promise<RemoteStopFinalizeFact> => {
      return runRemoteStopFinalizeMechanicsUnit({
        recordingSessionId,
        endCapture: sttAudioCapture.endCapture,
        transcribeCapturedAudioIfNeeded,
        emitAvFact,
        getLastRemoteSttEmpty: () => lastRemoteSttEmptyRef.current,
        settleTimeoutMs: ORCHESTRATOR_STT_SETTLE_TIMEOUT_MS,
      });
    },
    [emitAvFact, sttAudioCapture, transcribeCapturedAudioIfNeeded],
  );

  const stopListening = useCallback(async () => {
    const recordingSessionId = recordingSessionRef.current ?? undefined;
    logInfo('AgentOrchestrator', 'voice listen stop requested', {
      recordingSessionId,
    });
    stopRequestedRef.current = true;
    setAudioState('stopping', { recordingSessionId, reason: 'stopRequested' });
    if (listenSttPathRef.current === 'remote') {
      pendingCapturedAudioRef.current = null;
      await sttAudioCapture.cancelCapture(recordingSessionId);
      setAudioState('idleReady', {
        recordingSessionId,
        reason: 'remoteCaptureCancelled',
      });
      sessionCoordinator.setNativeRestartGuardUntil(
        Date.now() + NATIVE_RESTART_GUARD_MS,
      );
      settlementCoordinator.clearFinalizeTimer();
      finalizeStop('stopListening', recordingSessionId);
      return;
    }
    const V = voiceRef.current;
    const onStopped = () => {
      logInfo('AgentOrchestrator', 'native voice stop completed', {
        recordingSessionId,
      });
      const next = settlementCoordinator.getPendingSubmitWhenReady()
        ? 'settling'
        : 'idleReady';
      setAudioState(next, { recordingSessionId, reason: 'nativeStopComplete' });
      sessionCoordinator.setNativeRestartGuardUntil(
        Date.now() + NATIVE_RESTART_GUARD_MS,
      );
    };
    const runStop = () =>
      runNativeStopFlow(
        sessionCoordinator,
        V,
        getVoiceNative,
        recordingSessionId,
        onStopped,
      );
    await runNativeStopWithLogging(
      recordingSessionId,
      runStop,
      settlementCoordinator.getPendingSubmitWhenReady(),
    );
    settlementCoordinator.clearFinalizeTimer();
    settlementCoordinator.scheduleDelayedFinalize(
      'stopListening',
      recordingSessionId,
      300,
    );
  }, [
    finalizeStop,
    runNativeStopWithLogging,
    setAudioState,
    sessionCoordinator,
    sttAudioCapture,
    settlementCoordinator,
  ]);

  const stopListeningAndRequestSubmit = useCallback(async () => {
    const recordingSessionId = recordingSessionRef.current ?? undefined;
    logInfo('AgentOrchestrator', 'voice listen stop requested', {
      recordingSessionId,
    });
    logInfo('AgentOrchestrator', 'transcript finalization started', {
      recordingSessionId,
    });
    stopRequestedRef.current = true;
    setAudioState('stopping', { recordingSessionId, reason: 'stopForSubmit' });
    if (listenSttPathRef.current === 'remote') {
      const mechanics = await runRemoteStopFinalizeMechanics(recordingSessionId);
      applyAvFact(mechanics);
      return;
    }
    settlementCoordinator.setPendingSubmit(recordingSessionRef.current);
    settlementCoordinator.clearFinalizeTimer();
    const V = voiceRef.current;
    const onStopped = () => {
      logInfo('AgentOrchestrator', 'native voice stop completed', {
        recordingSessionId,
      });
      setAudioState('settling', {
        recordingSessionId,
        reason: 'nativeStopComplete',
      });
      sessionCoordinator.setNativeRestartGuardUntil(
        Date.now() + NATIVE_RESTART_GUARD_MS,
      );
    };
    const runStop = () =>
      runNativeStopFlow(
        sessionCoordinator,
        V,
        getVoiceNative,
        recordingSessionId,
        onStopped,
      );
    await runNativeStopWithLogging(
      recordingSessionId,
      runStop,
      settlementCoordinator.getPendingSubmitWhenReady(),
    );
    settlementCoordinator.scheduleFlushWindow(() => {
      const sessionId = recordingSessionRef.current ?? undefined;
      resolveSettlement('flushWindowExpired', sessionId);
    });
  }, [
    applyAvFact,
    resolveSettlement,
    runNativeStopWithLogging,
    runRemoteStopFinalizeMechanics,
    setAudioState,
    sessionCoordinator,
    settlementCoordinator,
  ]);

  const startListening = useCallback(
    async (fresh = false): Promise<{ ok: boolean; reason?: string }> => {
      const snap = snapshotSttResolution();
      sessionSttProviderRef.current = snap.provider;
      sessionSttOverrideAppliedRef.current = snap.overrideApplied;
      logInfo('AgentOrchestrator', 'stt resolution snapshot', {
        provider: snap.provider,
        overrideApplied: snap.overrideApplied,
        envMode: getSttProvider(),
        seamStore: getSttOverrideStoreSnapshot(),
      });
      const sttProvider = snap.provider;
      const V = voiceRef.current;
      /** True after beginCapture succeeded; used to cancel capture on error. */
      let remoteCaptureStarted = false;
      if (!V && sttProvider === 'local') {
        logWarn(
          'AgentOrchestrator',
          'start attempt rejected: voice module unavailable',
        );
        return { ok: false, reason: 'voiceUnavailable' };
      }
      if (!V && isRemoteWithLocalFallbackStt(sttProvider)) {
        if (nextListenLocalPreferenceRef.current) {
          logWarn(
            'AgentOrchestrator',
            'start attempt rejected: voice module unavailable',
          );
          return { ok: false, reason: 'voiceUnavailable' };
        }
        if (!endpointBaseUrl) {
          logWarn(
            'AgentOrchestrator',
            'start attempt rejected: voice module unavailable',
          );
          return { ok: false, reason: 'voiceUnavailable' };
        }
      }
      const block = sessionCoordinator.shouldBlockStart();
      if (block.block) {
        logWarn('AgentOrchestrator', 'start attempt rejected', {
          reason: block.reason,
          audioState: sessionCoordinator.getAudioState(),
          recordingSessionId: recordingSessionRef.current ?? undefined,
        });
        applyIoBlock(block.reason ?? 'blocked');
        return { ok: false, reason: block.reason };
      }
      if (
        settlementCoordinator.getPendingSubmitWhenReady() &&
        !settlementCoordinator.getSettlementResolved()
      ) {
        logWarn(
          'AgentOrchestrator',
          'start attempt rejected: pending settlement still open',
          {
            pendingSubmitWhenReady:
              settlementCoordinator.getPendingSubmitWhenReady(),
            settlementResolved: settlementCoordinator.getSettlementResolved(),
            audioState: sessionCoordinator.getAudioState(),
          },
        );
        return { ok: false, reason: 'pendingSettlement' };
      }
      if (mode === 'processing' || mode === 'speaking') {
        logWarn(
          'AgentOrchestrator',
          'start attempt rejected: lifecycle blocked',
          { mode },
        );
        return { ok: false, reason: 'lifecycleBlocked' };
      }
      setError(null);
      if (fresh) {
        committedTextRef.current = '';
        partialTranscriptRef.current = '';
        lastPartialNormalizedRef.current = '';
        speechEndedRef.current = false;
        updateTranscript('');
      } else {
        committedTextRef.current = transcribedTextRef.current;
      }
      settlementCoordinator.resetForNewSession();
      pendingCapturedAudioRef.current = null;
      recordingSessionSeqRef.current += 1;
      const recordingSessionId = `rec-${recordingSessionSeqRef.current}`;
      logInfo('AgentOrchestrator', 'voice listen start requested', {
        recordingSessionId,
        fresh,
        committedChars: committedTextRef.current.length,
        stt_preferred_mode: sttProvider,
        stt_override_applied: sessionSttOverrideAppliedRef.current ?? false,
        stt_env_mode: getSttProvider(),
        endpointBaseUrl: endpointBaseUrl ?? null,
      });
      recordingStartAtRef.current = Date.now();
      firstPartialAtRef.current = null;
      firstFinalAtRef.current = null;
      setAudioState('starting', { recordingSessionId });
      try {
        const startRoute = selectAvStartRoute({
          sttProvider,
          hasVoiceModule: !!V,
          endpointAvailable: endpointBaseUrl != null,
          nextListenLocalPreference: nextListenLocalPreferenceRef.current,
        });
        if (startRoute.route === 'remote_capture_required') {
          if (!endpointBaseUrl) {
            const message =
              'OpenAI proxy base URL not configured (ENDPOINT_BASE_URL)';
            setAudioState('idleReady', { recordingSessionId });
            setError(message);
            logError(
              'AgentOrchestrator',
              'remote stt start blocked: base URL missing',
              {
                recordingSessionId,
                sttProvider,
              },
            );
            return { ok: false, reason: 'sttBaseUrlMissing' };
          }
          const remoteOk = await startAvRemoteCaptureListening(
            recordingSessionId,
            sttProvider,
          );
          if (!remoteOk) {
            if (sttProvider === 'remote') {
              const message = 'Remote STT audio capture unavailable';
              setAudioState('idleReady', { recordingSessionId });
              setError(message);
              logError(
                'AgentOrchestrator',
                'remote stt start blocked: audio capture unavailable',
                {
                  recordingSessionId,
                  sttProvider,
                  endpointBaseUrl,
                },
              );
              return { ok: false, reason: 'sttCaptureUnavailable' };
            }
          } else {
            remoteCaptureStarted = true;
            return { ok: true };
          }
        }
        if (!V) {
          logWarn(
            'AgentOrchestrator',
            'start attempt rejected: voice module unavailable',
          );
          return { ok: false, reason: 'voiceUnavailable' };
        }
        await startAvLocalVoiceListening(recordingSessionId, sttProvider, {
          clearedNextListenPreference:
            startRoute.route === 'local_voice_next_listen_preference',
          startTimeFallbackReason:
            startRoute.route === 'local_voice_remote_unavailable'
              ? startRoute.fallbackReason
              : undefined,
        });
        return { ok: true };
      } catch (e) {
        if (remoteCaptureStarted) {
          pendingCapturedAudioRef.current = null;
          await sttAudioCapture.cancelCapture(recordingSessionId);
        }
        setAudioState('idleReady', { recordingSessionId });
        const message =
          e instanceof Error ? e.message : 'Failed to start voice';
        if (isRecognizerReentrancyError(message)) {
          logWarn(
            'AgentOrchestrator',
            'voice listen start blocked by native reentrancy',
            {
              recordingSessionId,
              message,
            },
          );
          sessionCoordinator.setNativeRestartGuardUntil(
            Date.now() + NATIVE_RESTART_GUARD_MS,
          );
          applyIoBlock('nativeReentrancy');
          return { ok: false, reason: 'nativeReentrancy' };
        }
        setError(message);
        setProcessingSubstate(null);
        setMode('idle');
        setLifecycle('error');
        logError('AgentOrchestrator', 'voice listen start failed', {
          recordingSessionId,
          message,
        });
        return { ok: false, reason: 'startFailed' };
      }
    },
    [
      applyIoBlock,
      endpointBaseUrl,
      mode,
      selectAvStartRoute,
      setAudioState,
      sessionCoordinator,
      settlementCoordinator,
      startAvLocalVoiceListening,
      startAvRemoteCaptureListening,
      sttAudioCapture,
      updateTranscript,
    ],
  );

  useEffect(() => {
    const sub = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'background' && modeRef.current === 'listening') {
          stopListening();
        }
      },
    );
    return () => sub.remove();
  }, [stopListening]);

  const submit = useCallback(async (): Promise<string | null> => {
    // --- Submission / acceptance contract (Contracts for Request Control plan) ---
    // Acceptance rule: requestInFlightRef must be false and normalizeTranscript(candidate input) must be non-empty.
    // Request becomes real (request_start = request accepted = processing start) only when both guards pass and requestId is assigned.
    // Current runtime policy: no queueing; no automatic cancel; no automatic supersession; new input during processing/speaking is denied.
    // Cancel/supersession is contract-defined but implementation-deferred; all callbacks must guard with activeRequestIdRef === reqId before mutating state.
    // Guard points (activeRequestIdRef.current === reqId before mutating): onRetrievalComplete, onModelLoadStart, onGenerationStart, onValidationStart, onPartial; after ragAsk return (stale check); in catch before request_failed and lifecycle update.
    // ---
    // Canonical path: normalize → retrieval → context → payload → inference (stream) → settle → cards/rules update → speak → idle.
    if (modeRef.current === 'speaking' || lifecycleRef.current === 'speaking') {
      logWarn('AgentOrchestrator', 'submit blocked because playback is active');
      return null;
    }
    if (requestInFlightRef.current) {
      logWarn(
        'AgentOrchestrator',
        'submit blocked because active request exists',
      );
      return null;
    }
    // Normalize input (canonical step: trim + collapse whitespace).
    // Canonical normalize step for accepted transcript before RAG submit.
    logInfo('AgentOrchestrator', 'submit candidate snapshot', {
      transcriptChars: transcribedTextRef.current.length,
      transcriptText: transcribedTextRef.current,
      transcriptPreview: transcriptPreview(transcribedTextRef.current),
      partialChars: partialTranscriptRef.current.length,
      partialText: partialTranscriptRef.current,
      partialPreview: transcriptPreview(partialTranscriptRef.current),
    });
    const question = normalizeTranscript(transcribedTextRef.current);
    if (!question) {
      logWarn('AgentOrchestrator', 'submit skipped: empty transcript', {
        transcriptChars: transcribedTextRef.current.length,
      });
      return null;
    }
    const acceptedTranscript = transcribedTextRef.current;
    const normalizedTranscript = question;
    requestIdRef.current += 1;
    const reqId = requestIdRef.current;
    previousCommittedResponseRef.current = responseTextRef.current;
    previousCommittedValidationRef.current = validationSummaryRef.current;
    activeRequestIdRef.current = reqId;
    requestInFlightRef.current = true;
    logInfo('AgentOrchestrator', 'active requestId set', { requestId: reqId });
    setError(null);
    setResponseText(null);
    setValidationSummary(null);
    setMode('processing');
    {
      const prev = prevLifecycleRef.current;
      if (prev !== 'processing') {
        logLifecycle(
          'AgentOrchestrator',
          `lifecycle transition ${prev} -> processing`,
          {
            requestId: reqId,
          },
        );
        prevLifecycleRef.current = 'processing';
      }
    }
    setLifecycle('processing');
    logInfo('ResponseSurface', 'response_surface_hidden_on_new_request', {
      requestId: reqId,
      lifecycle: 'processing',
      reason: 'newRequestStart',
    });
    setProcessingSubstate('retrieving');
    emitRequestDebug(requestDebugSinkRef, {
      type: 'processing_substate',
      requestId: reqId,
      processingSubstate: 'retrieving',
      timestamp: Date.now(),
    });
    const requestStartedAt = Date.now();
    emitRequestDebug(requestDebugSinkRef, {
      type: 'request_start',
      requestId: reqId,
      acceptedTranscript,
      normalizedTranscript,
      requestStartedAt,
      timestamp: requestStartedAt,
      lifecycle: 'processing',
      platform: Platform.OS,
    });
    logInfo('AgentOrchestrator', 'request started', {
      requestId: reqId,
      transcriptChars: transcribedTextRef.current.length,
      partialChars: partialTranscriptRef.current.length,
      normalizedChars: question.length,
      wordCount: question.split(/\s+/).filter(Boolean).length,
      transcriptText: question,
      transcriptPreview: transcriptPreview(question),
    });
    listenersRef?.current?.onRequestStart?.();
    appendOrchEvidenceRef.current('onRequestStart', { requestId: reqId });
    const retrievalStartedAt = Date.now();
    emitRequestDebug(requestDebugSinkRef, {
      type: 'retrieval_start',
      requestId: reqId,
      retrievalStartedAt,
      timestamp: retrievalStartedAt,
    });
    logInfo('AgentOrchestrator', 'retrieval started', { requestId: reqId });
    listenersRef?.current?.onRetrievalStart?.();
    appendOrchEvidenceRef.current('onRetrievalStart', { requestId: reqId });
    let runResult: Awaited<ReturnType<typeof executeRequest>> | null = null;
    try {
      runResult = await executeRequest({
        requestId: reqId,
        question,
        requestDebugSink: requestDebugSinkRef?.current ?? undefined,
        activeRequestIdRef,
        setResponseText,
        setValidationSummary,
        setProcessingSubstate,
        listenersRef: listenersRef ?? { current: null },
        getPackState: () => !!getPackState(),
        copyBundlePackToDocuments,
        getContentPackPathInDocuments,
        createDocumentsPackReader,
        createBundlePackReader,
        createThrowReader,
        getPackEmbedModelId: (reader: unknown) =>
          getPackEmbedModelId(
            reader as Parameters<typeof getPackEmbedModelId>[0],
          ),
        getOnDeviceModelPaths,
        previousCommittedResponseRef,
        previousCommittedValidationRef,
        semanticEvidenceEventsRef,
      });
    } catch {
      requestInFlightRef.current = false;
      setAudioState('idleReady', { reason: 'requestFailed' });
      return null;
    }
    if (!runResult || runResult.status === 'stale') {
      requestInFlightRef.current = false;
      return null;
    }
    if (runResult.status === 'front_door') {
      requestInFlightRef.current = false;
      activeRequestIdRef.current = 0;
      logInfo('AgentOrchestrator', 'active requestId cleared', {
        requestId: reqId,
        reason: 'semantic_front_door',
      });
      const fd = runResult.semanticFrontDoor;
      const committed = committedResponseFromSemanticFrontDoor(fd);
      const proposed = resolveScriptedAnswerSlot({
        path: 'front_door',
        kind: committed.kind,
        draftText: committed.text,
      });
      setResponseText(
        proposed != null && proposed.trim().length > 0 ? proposed : null,
      );
      setValidationSummary(null);
      previousCommittedResponseRef.current = null;
      previousCommittedValidationRef.current = null;
      setLastFrontDoorOutcome({ requestId: reqId, semanticFrontDoor: fd });
      setProcessingSubstate(null);
      emitRequestDebug(requestDebugSinkRef, {
        type: 'processing_substate',
        requestId: reqId,
        processingSubstate: null,
        timestamp: Date.now(),
      });
      setMode('idle');
      setLifecycle('idle');
      setAudioState('idleReady', { reason: 'semanticFrontDoor' });
      setError(null);
      emitRecoverableFailure(
        recoverableReasonKeyForFrontDoorVerdict(fd.front_door_verdict),
        {
          frontDoorVerdict: fd.front_door_verdict,
          resolverMode: fd.resolver_mode,
          semanticFrontDoor: fd,
        },
      );
      emitRequestDebug(requestDebugSinkRef, {
        type: 'request_complete',
        requestId: reqId,
        status: 'completed_front_door',
        frontDoorVerdict: fd.front_door_verdict,
        completedAt: Date.now(),
        lifecycle: 'idle',
        timestamp: Date.now(),
      });
      return null;
    }
    if (runResult.status === 'failed') {
      requestInFlightRef.current = false;
      activeRequestIdRef.current = 0;
      logInfo('AgentOrchestrator', 'active requestId cleared', {
        requestId: reqId,
      });
      setResponseText(previousCommittedResponseRef.current);
      setValidationSummary(previousCommittedValidationRef.current);
      previousCommittedResponseRef.current = null;
      previousCommittedValidationRef.current = null;
      setProcessingSubstate(null);
      emitRequestDebug(requestDebugSinkRef, {
        type: 'processing_substate',
        requestId: reqId,
        processingSubstate: null,
        timestamp: Date.now(),
      });
      setMode('idle');
      setLifecycle('idle');
      setAudioState('idleReady', { reason: 'requestFailed' });

      const failedAt = Date.now();
      const domainValid = runResult.classification.stage !== 'speech';
      emitContextArtifactDebug(
        requestDebugSinkRef,
        {
          requestId: reqId,
          timestamp: failedAt,
        },
        () =>
          projectContextArtifact({
            requestId: reqId,
            timestampMs: failedAt,
            rawText: acceptedTranscript,
            normalizedText: normalizedTranscript,
            domainValid,
            validationSummary: null,
            fallbackUsed: false,
          }),
      );
      emitFailureArtifactDebug(
        requestDebugSinkRef,
        {
          requestId: reqId,
          timestamp: failedAt,
        },
        () =>
          projectFailureArtifact({
            requestId: reqId,
            timestampMs: failedAt,
            rawText: acceptedTranscript,
            normalizedText: normalizedTranscript,
            failureClassification: runResult.classification,
            domainValid,
          }),
      );
      setError(runResult.displayMessage);
      listenersRef?.current?.onError?.(runResult.classification.kind, {
        stage: runResult.classification.stage,
        recoverability: runResult.classification.recoverability,
        transientEvent: runResult.classification.transientEvent,
        telemetryReason: runResult.classification.telemetryReason,
      });
      appendOrchEvidenceRef.current('onError', {
        reason: runResult.classification.kind,
        requestId: reqId,
        stage: runResult.classification.stage,
        recoverability: runResult.classification.recoverability,
        transientEvent: runResult.classification.transientEvent,
        telemetryReason: runResult.classification.telemetryReason,
      });
      return null;
    }
    requestInFlightRef.current = false;
    setError(null);
    setLastFrontDoorOutcome(null);
    setProcessingSubstate(null);
    emitRequestDebug(requestDebugSinkRef, {
      type: 'processing_substate',
      requestId: reqId,
      processingSubstate: null,
      timestamp: Date.now(),
    });
    if (runResult.shouldPlay) {
      playbackRequestIdRef.current = reqId;
      if (isLogGateEnabled('playbackHandoff')) {
        logInfo(
          'ResponseSurface',
          'response_surface_playback_bound_to_committed_response',
          {
            requestId: reqId,
            speakingBoundToCommittedResponse: true,
            committedChars: runResult.committedText.length,
          },
        );
      }
      playTextRef.current?.(runResult.committedText).catch(() => undefined);

      // Defer artifact emission so we do not block the Piper TTS macrotask
      // responsible for lifecycle fanout + `tts_start` debug evidence.
      setTimeout(() => {
        const completedAtForArtifacts = Date.now();
        emitContextArtifactDebug(
          requestDebugSinkRef,
          {
            requestId: reqId,
            timestamp: completedAtForArtifacts,
          },
          () =>
            projectContextArtifact({
              requestId: reqId,
              timestampMs: completedAtForArtifacts,
              rawText: acceptedTranscript,
              normalizedText: normalizedTranscript,
              domainValid: true,
              validationSummary: runResult.validationSummary,
              fallbackUsed: false,
            }),
        );
        emitSettlementArtifactDebug(
          requestDebugSinkRef,
          {
            requestId: reqId,
            timestamp: completedAtForArtifacts,
          },
          () =>
            projectSettlementArtifact({
              requestId: reqId,
              timestampMs: completedAtForArtifacts,
              lifecycle: lifecycleRef.current,
              rawText: acceptedTranscript,
              normalizedText: normalizedTranscript,
              responseText: runResult.committedText,
              validationSummary: runResult.validationSummary,
            }),
        );
      }, 0);
      return runResult.committedText;
    }
    // When not playing: transition to idle. When shouldPlay we skip this so playText() sets speaking (avoids processing->idle->speaking and idle fan-out cost).
    setMode('idle');
    setLifecycle('idle');
    if (!runResult.shouldPlay) {
      const completedAtForArtifacts = Date.now();
      emitContextArtifactDebug(
        requestDebugSinkRef,
        {
          requestId: reqId,
          timestamp: completedAtForArtifacts,
        },
        () =>
          projectContextArtifact({
            requestId: reqId,
            timestampMs: completedAtForArtifacts,
            rawText: acceptedTranscript,
            normalizedText: normalizedTranscript,
            domainValid: true,
            validationSummary: runResult.validationSummary,
            fallbackUsed: false,
          }),
      );
      emitSettlementArtifactDebug(
        requestDebugSinkRef,
        {
          requestId: reqId,
          timestamp: completedAtForArtifacts,
        },
        () =>
          projectSettlementArtifact({
            requestId: reqId,
            timestampMs: completedAtForArtifacts,
            lifecycle: lifecycleRef.current,
            rawText: acceptedTranscript,
            normalizedText: normalizedTranscript,
            responseText: runResult.committedText,
            validationSummary: runResult.validationSummary,
          }),
      );
      activeRequestIdRef.current = 0;
      const completedAt = Date.now();
      emitRequestDebug(requestDebugSinkRef, {
        type: 'request_complete',
        requestId: reqId,
        status: 'completed',
        completedAt,
        lifecycle: 'idle',
        timestamp: completedAt,
      });
      setAudioState('idleReady', { reason: 'requestComplete' });
      logInfo('AgentOrchestrator', 'active requestId cleared', {
        requestId: reqId,
      });
    }
    return runResult.committedText;
  }, [listenersRef, requestDebugSinkRef, semanticEvidenceEventsRef, setAudioState]);

  const playText = useCallback(
    async (text: string) => {
      const normalized = text.trim();
      if (!normalized) {
        logWarn('AgentOrchestrator', 'playback skipped: empty text');
        return;
      }
      setError(null);
      playbackInterruptedRef.current = false;

      if (
        lifecycleRef.current === 'speaking' ||
        modeRef.current === 'speaking'
      ) {
        const supersededId = playbackInflightAttemptIdRef.current;
        if (supersededId != null) {
          playbackAwaitingTerminalRef.current.delete(supersededId);
          try {
            const P = require('piper-tts').default;
            if (typeof P?.stop === 'function') P.stop();
          } catch {
            /* ignore */
          }
          try {
            ttsRef.current?.stop();
          } catch {
            /* ignore */
          }
          const fact = finishAvPlaybackLifecycle(Date.now(), 'cancelled');
          emitAvFact(fact);
        }
      }

      const attemptId = ++playbackAttemptSeqRef.current;
      playbackInflightAttemptIdRef.current = attemptId;
      playbackAwaitingTerminalRef.current.add(attemptId);

      const PiperTts = require('piper-tts').default;
      let canUsePiper = piperAvailable;
      if (!canUsePiper && PiperTts?.isModelAvailable) {
        try {
          canUsePiper = !!(await PiperTts.isModelAvailable());
          setPiperAvailable(canUsePiper);
        } catch {
          canUsePiper = false;
        }
      }
      if (canUsePiper) {
        const playbackRoute = selectAvPlaybackRoute(true);
        logInfo('Playback', 'tts path selected', {
          provider: 'piper',
          textChars: normalized.length,
        });
        PiperTts.setOptions({
          lengthScale: 1.08,
          noiseScale: 0.62,
          noiseW: 0.8,
          gainDb: 0,
          interSentenceSilenceMs: 250,
          interCommaSilenceMs: 125,
        });
        const speakPromise = PiperTts.speak(normalized);
        queueMicrotask(() => {
          if (playbackInflightAttemptIdRef.current !== attemptId) return;
          const fact = startAvPlaybackLifecycle(playbackRoute);
          emitAvFact(fact);
        });
        try {
          await speakPromise;
        } catch (e) {
          if (playbackInflightAttemptIdRef.current !== attemptId) return;
          if (
            !consumePlaybackTerminalSlot(playbackAwaitingTerminalRef, attemptId)
          )
            return;
          const code = readNativeErrorCode(e);
          if (playbackInterruptedRef.current || code === 'E_CANCELLED') {
            const fact = finishAvPlaybackLifecycle(Date.now(), 'cancelled');
            emitAvFact(fact);
          } else {
            const message =
              e instanceof Error ? e.message : 'Piper playback failed';
            logError('Playback', 'piper playback failed', {
              message,
              textChars: normalized.length,
            });
            const fact = finishAvPlaybackLifecycle(
              Date.now(),
              'failed',
              message,
            );
            emitAvFact(fact);
          }
        } finally {
          const ttsEndedAt = Date.now();
          setTimeout(() => {
            if (playbackInflightAttemptIdRef.current !== attemptId) return;
            if (
              !consumePlaybackTerminalSlot(
                playbackAwaitingTerminalRef,
                attemptId,
              )
            )
              return;
            const fact = finishAvPlaybackLifecycle(ttsEndedAt, 'completed');
            emitAvFact(fact);
          }, 0);
        }
        return;
      }
      const playbackRoute = selectAvPlaybackRoute(false);
      let Tts: TtsModule;
      try {
        Tts = require('react-native-tts').default as TtsModule;
        ttsRef.current = Tts;
      } catch (e) {
        playbackAwaitingTerminalRef.current.delete(attemptId);
        playbackInflightAttemptIdRef.current = null;
        const message = e instanceof Error ? e.message : 'TTS failed to load';
        setError(message);
        logError('Playback', 'tts module load failed', { message });
        return;
      }
      try {
        await Tts.getInitStatus();
        if (Platform.OS === 'android') Tts.stop();
        logInfo('Playback', 'tts path selected', {
          provider: 'react-native-tts',
          textChars: normalized.length,
        });
        const endFallbackPlayback = (fromCancelEvent: boolean) => {
          if (playbackInflightAttemptIdRef.current !== attemptId) return;
          if (
            !consumePlaybackTerminalSlot(playbackAwaitingTerminalRef, attemptId)
          )
            return;
          const wantCancel = fromCancelEvent;
          const ttsEndedAt = Date.now();
          try {
            if (typeof Tts.removeEventListener === 'function') {
              Tts.removeEventListener('tts-finish', onFinishNatural);
              Tts.removeEventListener('tts-cancel', onFinishCancel);
            }
          } catch {
            /* ignore */
          }
          const fact = finishAvPlaybackLifecycle(
            ttsEndedAt,
            wantCancel ? 'cancelled' : 'completed',
          );
          emitAvFact(fact);
        };
        const onFinishNatural = () => endFallbackPlayback(false);
        const onFinishCancel = () => endFallbackPlayback(true);
        Tts.addEventListener('tts-finish', onFinishNatural);
        Tts.addEventListener('tts-cancel', onFinishCancel);
        const fact = startAvPlaybackLifecycle(playbackRoute);
        emitAvFact(fact);
        Tts.speak(normalized);
      } catch (e) {
        playbackAwaitingTerminalRef.current.delete(attemptId);
        playbackInflightAttemptIdRef.current = null;
        if (!playbackInterruptedRef.current) {
          const message =
            e instanceof Error ? e.message : 'TTS playback failed';
          setError(message);
          setProcessingSubstate(null);
          setMode('idle');
          setLifecycle('error');
          logError('Playback', 'tts playback failed', {
            message,
            textChars: normalized.length,
          });
        }
      }
    },
    [
      emitAvFact,
      finishAvPlaybackLifecycle,
      piperAvailable,
      selectAvPlaybackRoute,
      startAvPlaybackLifecycle,
    ],
  );

  playTextRef.current = playText;

  const cancelPlayback = useCallback(() => {
    if (
      lifecycleRef.current !== 'speaking' &&
      modeRef.current !== 'speaking'
    ) {
      return;
    }
    const aid = playbackInflightAttemptIdRef.current;
    if (aid == null) return;
    if (!consumePlaybackTerminalSlot(playbackAwaitingTerminalRef, aid)) return;
    logInfo('AgentOrchestrator', 'playback interrupted');
    playbackInterruptedRef.current = true;
    try {
      const PiperTts = require('piper-tts').default;
      if (typeof PiperTts?.stop === 'function') PiperTts.stop();
    } catch {
      /* ignore */
    }
    try {
      ttsRef.current?.stop();
    } catch {
      /* ignore */
    }
    const fact = finishAvPlaybackLifecycle(Date.now(), 'cancelled');
    emitAvFact(fact);
    setTimeout(() => {
      playbackInterruptedRef.current = false;
    }, 120);
  }, [emitAvFact, finishAvPlaybackLifecycle]);

  const clearError = useCallback(() => {
    setError(null);
    setProcessingSubstate(null);
    setLifecycle('idle');
  }, []);

  const recoverFromRequestFailure = useCallback(() => {
    logInfo('AgentOrchestrator', 'failed request recovery started');
    settlementCoordinator.resetForNewSession();
    requestInFlightRef.current = false;
    activeRequestIdRef.current = 0;
    if (modeRef.current === 'listening') {
      stopListening();
    }
    setError(null);
    setProcessingSubstate(null);
    setLastFrontDoorOutcome(null);
    setMode('idle');
    setLifecycle('idle');
    logInfo('AgentOrchestrator', 'retryable idle state restored');
  }, [stopListening, settlementCoordinator]);

  // Lazy-load Voice
  useEffect(() => {
    try {
      const VoiceNative = getVoiceNative();
      if (!VoiceNative) {
        setError(
          'Speech recognition not available (native Voice module not linked).',
        );
        setVoiceReady(true);
        voiceRef.current = null;
        return;
      }
      if (
        typeof (VoiceNative as { addListener?: unknown }).addListener !==
        'function'
      ) {
        (VoiceNative as { addListener: () => void }).addListener = () => {};
      }
      if (
        typeof (VoiceNative as { removeListeners?: unknown })
          .removeListeners !== 'function'
      ) {
        (
          VoiceNative as { removeListeners: (_: number) => void }
        ).removeListeners = () => {};
      }
      const Voice = require('@react-native-voice/voice').default as VoiceModule;
      const hasStartApi =
        typeof Voice?.start === 'function' ||
        typeof VoiceNative?.startSpeech === 'function';
      const hasStopApi =
        typeof Voice?.stop === 'function' ||
        typeof VoiceNative?.stopSpeech === 'function';
      if (!hasStartApi || !hasStopApi) {
        setError(
          'Speech recognition not available (Voice start/stop API missing).',
        );
        setVoiceReady(true);
        voiceRef.current = null;
        return;
      }
      voiceRef.current = Voice;
      setVoiceReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice module failed to load');
    }
    return () => {
      const V = voiceRef.current;
      if (V) {
        try {
          V.onSpeechResults = null;
          V.onSpeechPartialResults = null;
          V.onSpeechError = null;
          V.onSpeechEnd = null;
          V.removeAllListeners();
        } catch {
          /* ignore */
        }
        Promise.resolve(V.destroy()).catch(() => {});
        voiceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {};
  }, []);

  useEffect(() => {
    if (voiceReady) {
      logInfo('AgentOrchestrator', 'initialized');
      logInfo('AgentOrchestrator', 'runtime lifecycle ready');
    }
  }, [voiceReady]);

  useEffect(() => {
    const prev = prevLifecycleRef.current;
    if (prev !== lifecycle) {
      const details: { requestId?: number } = {};
      const activeRequestId = activeRequestIdRef.current;
      const requestScopedTransition =
        prev === 'processing' ||
        lifecycle === 'processing' ||
        prev === 'speaking' ||
        lifecycle === 'speaking' ||
        requestInFlightRef.current;
      if (activeRequestId > 0 && requestScopedTransition) {
        details.requestId = activeRequestId;
      }
      logLifecycle(
        'AgentOrchestrator',
        `lifecycle transition ${prev} -> ${lifecycle}`,
        details,
      );
      prevLifecycleRef.current = lifecycle;
    }
  }, [lifecycle]);

  useEffect(() => {
    if (lifecycle !== 'idle' && lifecycle !== 'error') return;
    const pending = pendingPlaybackCompleteRef.current;
    if (!pending) return;
    pendingPlaybackCompleteRef.current = null;
    const completeLifecycle =
      pending.playbackOutcome === 'failed' ? 'error' : 'idle';
    emitRequestDebug(requestDebugSinkRef, {
      type: 'request_complete',
      requestId: pending.requestId,
      status: 'completed',
      completedAt: pending.endedAt,
      lifecycle: completeLifecycle,
      timestamp: pending.endedAt,
      playbackOutcome: pending.playbackOutcome,
    });
    logInfo('AgentOrchestrator', 'request_complete', {
      requestId: pending.requestId,
      lifecycle: completeLifecycle,
      playbackOutcome: pending.playbackOutcome,
    });
    activeRequestIdRef.current = 0;
    logInfo('AgentOrchestrator', 'active requestId cleared', {
      requestId: pending.requestId,
    });
    logInfo('ResponseSurface', 'response_surface_concealed_after_playback', {
      requestId: pending.requestId,
      lifecycle: 'idle',
      reason:
        pending.playbackOutcome === 'cancelled'
          ? 'playbackCancelled'
          : pending.playbackOutcome === 'failed'
            ? 'playbackFailed'
            : 'playbackComplete',
    });
  }, [lifecycle, requestDebugSinkRef]);

  useEffect(() => {
    // No lifecycle-based resets here; native readiness is owned by native start/stop boundaries.
  }, [mode, lifecycle]);

  // Voice event handlers: update transcript and notify for pulse. Late-event isolation: guards at top before any mutation.
  useEffect(() => {
    const V = voiceRef.current;
    if (!V) return;
    V.onSpeechResults = e => {
      const sessionId = recordingSessionRef.current ?? undefined;
      if (settlementCoordinator.getSettlementResolved()) {
        logWarn('AgentOrchestrator', 'late final ignored for settled session', {
          recordingSessionId: sessionId,
        });
        return;
      }
      if (
        sessionId &&
        sessionId === settlementCoordinator.getLastSettledSessionId()
      ) {
        logWarn('AgentOrchestrator', 'late final ignored for settled session', {
          recordingSessionId: sessionId,
        });
        return;
      }
      if (!sessionId && !stopRequestedRef.current) {
        logWarn(
          'AgentOrchestrator',
          'late final ignored for inactive session',
          {},
        );
        return;
      }
      if (modeRef.current !== 'listening' && !stopRequestedRef.current) return;
      const next = (e.value?.[0] ?? '').trim();
      const normalizedIncoming = normalizeTranscript(next);
      if (speechEndedRef.current) {
        const priorCommitted = normalizeTranscript(transcribedTextRef.current);
        type LateFinalRejectReason =
          | 'not_longer'
          | 'not_pending_submit'
          | 'remote_path'
          | 'empty';
        let rejectReason: LateFinalRejectReason | null = null;
        if (listenSttPathRef.current === 'remote') {
          rejectReason = 'remote_path';
        } else if (!normalizedIncoming.length) {
          rejectReason = 'empty';
        } else if (
          !settlementCoordinator.getPendingSubmitWhenReady() ||
          recordingSessionRef.current !==
            settlementCoordinator.getPendingSubmitSessionId()
        ) {
          rejectReason = 'not_pending_submit';
        } else if (normalizedIncoming.length <= priorCommitted.length) {
          rejectReason = 'not_longer';
        }

        if (rejectReason !== null) {
          logInfo('AgentOrchestrator', 'late_final_rejected_post_speech_end', {
            recordingSessionId: sessionId,
            reason: rejectReason,
            priorChars: priorCommitted.length,
            priorTranscriptPreview: transcriptPreview(
              transcribedTextRef.current,
            ),
            incomingChunkChars: normalizedIncoming.length,
            incomingTranscriptPreview: transcriptPreview(normalizedIncoming),
          });
          if (rejectReason !== 'empty') {
            logInfo(
              'AgentOrchestrator',
              'final ignored because speechEndedRef=true',
              {
                recordingSessionId: sessionId,
                pendingSubmitWhenReady:
                  settlementCoordinator.getPendingSubmitWhenReady(),
                settlementResolved:
                  settlementCoordinator.getSettlementResolved(),
                finalStabilizationActive:
                  settlementCoordinator.getFinalStabilizationActive(),
                incomingChunkChars: normalizedIncoming.length,
                incomingTranscriptText: normalizedIncoming,
                incomingTranscriptPreview:
                  transcriptPreview(normalizedIncoming),
              },
            );
          }
          return;
        }

        logInfo('AgentOrchestrator', 'late_final_accepted_post_speech_end', {
          recordingSessionId: sessionId,
          priorChars: priorCommitted.length,
          priorTranscriptPreview: transcriptPreview(transcribedTextRef.current),
          incomingChars: normalizedIncoming.length,
          incomingTranscriptPreview: transcriptPreview(normalizedIncoming),
        });
      }
      if (!next) return;
      const committed = committedTextRef.current.trim();
      const combined = committed ? `${committed} ${next}` : next;
      partialTranscriptRef.current = '';
      updateTranscript(combined);
      const normalizedCombined = normalizeTranscript(combined);
      logInfo('AgentOrchestrator', 'speech final accepted', {
        recordingSessionId: sessionId,
        rawFinalChars: next.length,
        rawFinalText: next,
        rawFinalPreview: transcriptPreview(next),
        committedPrefixChars: committed.length,
        committedPrefixText: committed,
        committedPrefixPreview: transcriptPreview(committed),
        combinedChars: normalizedCombined.length,
        combinedTranscriptText: normalizedCombined,
        combinedTranscriptPreview: transcriptPreview(normalizedCombined),
      });
      if (!firstFinalAtRef.current) {
        firstFinalAtRef.current = Date.now();
        logInfo('AgentOrchestrator', 'first final received', {
          recordingSessionId: sessionId,
          tMs:
            recordingStartAtRef.current != null
              ? firstFinalAtRef.current - recordingStartAtRef.current
              : undefined,
        });
      }
      listenersRef?.current?.onTranscriptUpdate?.();
      appendOrchEvidenceRef.current('onTranscriptUpdate', {
        recordingSessionId: sessionId,
      });
      if (
        settlementCoordinator.getPendingSubmitWhenReady() &&
        recordingSessionRef.current ===
          settlementCoordinator.getPendingSubmitSessionId() &&
        !settlementCoordinator.getSettlementResolved()
      ) {
        settlementCoordinator.acceptFinalCandidate(
          normalizedCombined,
          sessionId ?? undefined,
        );
      }
    };
    V.onSpeechPartialResults = e => {
      const sessionId = recordingSessionRef.current ?? undefined;
      if (settlementCoordinator.getSettlementResolved()) {
        logWarn(
          'AgentOrchestrator',
          'late partial ignored for settled session',
          { recordingSessionId: sessionId },
        );
        return;
      }
      if (
        sessionId &&
        sessionId === settlementCoordinator.getLastSettledSessionId()
      ) {
        logWarn(
          'AgentOrchestrator',
          'late partial ignored for settled session',
          { recordingSessionId: sessionId },
        );
        return;
      }
      if (!sessionId && !stopRequestedRef.current) {
        logWarn(
          'AgentOrchestrator',
          'late partial ignored for inactive session',
          {},
        );
        return;
      }
      if (modeRef.current !== 'listening' && !stopRequestedRef.current) return;
      const partial = (e.value?.[0] ?? '').trim();
      const normalizedPartial = normalizeTranscript(partial);
      if (!normalizedPartial) {
        // Ignore empty partials to avoid churn and preserve last usable partial.
        return;
      }
      if (!firstPartialAtRef.current) {
        firstPartialAtRef.current = Date.now();
        logInfo('AgentOrchestrator', 'first partial received', {
          recordingSessionId: sessionId,
          tMs:
            recordingStartAtRef.current != null
              ? firstPartialAtRef.current - recordingStartAtRef.current
              : undefined,
        });
      }
      if (normalizedPartial === lastPartialNormalizedRef.current) {
        return;
      }
      lastPartialNormalizedRef.current = normalizedPartial;
      partialTranscriptRef.current = partial;
      logInfo('AgentOrchestrator', 'speech partial accepted', {
        recordingSessionId: sessionId,
        rawPartialChars: partial.length,
        rawPartialText: partial,
        rawPartialPreview: transcriptPreview(partial),
        normalizedPartialChars: normalizedPartial.length,
        normalizedPartialText: normalizedPartial,
        normalizedPartialPreview: transcriptPreview(normalizedPartial),
      });
      listenersRef?.current?.onTranscriptUpdate?.();
      appendOrchEvidenceRef.current('onTranscriptUpdate', {
        recordingSessionId: sessionId,
        partial: true,
      });
    };
    V.onSpeechError = e => {
      const sessionId = recordingSessionRef.current ?? undefined;
      if (
        settlementCoordinator.getSettlementResolved() ||
        (sessionId &&
          sessionId === settlementCoordinator.getLastSettledSessionId())
      ) {
        logWarn(
          'AgentOrchestrator',
          'late speechError downgraded for settled session',
          {
            recordingSessionId: sessionId,
            message: e.error?.message ?? 'Speech recognition error',
          },
        );
        return;
      }
      if (!sessionId && !stopRequestedRef.current) {
        logWarn(
          'AgentOrchestrator',
          'late speechError downgraded for inactive session',
          {
            message: e.error?.message ?? 'Speech recognition error',
          },
        );
        return;
      }
      if (stopRequestedRef.current || modeRef.current !== 'listening') {
        logWarn(
          'AgentOrchestrator',
          'post-stop speech error downgraded to non-fatal',
          {
            recordingSessionId: sessionId,
            message: e.error?.message ?? 'Speech recognition error',
          },
        );
        return;
      }
      const message = e.error?.message ?? 'Speech recognition error';
      if (isRecoverableSpeechError(message)) {
        logWarn(
          'AgentOrchestrator',
          'speech recognition error downgraded (recoverable)',
          {
            recordingSessionId: sessionId,
            message,
          },
        );
        emitRecoverableFailure('speechErrorRecoverable', {
          recordingSessionId: sessionId,
          message,
        });
        stopListeningAndRequestSubmit().catch(() => {});
        return;
      }
      if (
        isRecognizerReentrancyError(message) &&
        (sessionCoordinator.getAudioState() !== 'listening' ||
          sessionCoordinator.getIosStopPending() ||
          modeRef.current !== 'listening')
      ) {
        logWarn(
          'AgentOrchestrator',
          'speech recognition error downgraded (native reentrancy)',
          {
            recordingSessionId: sessionId,
            message,
            audioState: sessionCoordinator.getAudioState(),
            iosStopPending: sessionCoordinator.getIosStopPending(),
            mode: modeRef.current,
          },
        );
        sessionCoordinator.setNativeRestartGuardUntil(
          Date.now() + NATIVE_RESTART_GUARD_MS,
        );
        setAudioState(
          sessionCoordinator.getAudioState() === 'stopping'
            ? 'stopping'
            : 'settling',
          {
            recordingSessionId: sessionId,
            reason: 'nativeReentrancy',
          },
        );
        return;
      }
      setError(message);
      playError();
      settlementCoordinator.clearFinalizeTimer();
      stopRequestedRef.current = false;
      setProcessingSubstate(null);
      setMode('idle');
      setLifecycle('error');
      logError(
        'AgentOrchestrator',
        'speech recognition error (fatal: transcript acquisition failed)',
        {
          recordingSessionId: recordingSessionRef.current ?? undefined,
          message,
        },
      );
      setAudioState('settling', {
        recordingSessionId: sessionId,
        reason: 'speechErrorFatal',
      });
      sessionCoordinator.setNativeRestartGuardUntil(
        Date.now() + NATIVE_RESTART_GUARD_MS,
      );
      recordingSessionRef.current = null;
      speechEndedRef.current = false;
    };
    V.onSpeechEnd = () => {
      const recordingSessionId = recordingSessionRef.current ?? undefined;
      if (settlementCoordinator.getSettlementResolved()) {
        logWarn(
          'AgentOrchestrator',
          'late speechEnd ignored for settled session',
          { recordingSessionId },
        );
        return;
      }
      if (
        recordingSessionId &&
        recordingSessionId === settlementCoordinator.getLastSettledSessionId()
      ) {
        logWarn(
          'AgentOrchestrator',
          'late speechEnd ignored for settled session',
          { recordingSessionId },
        );
        return;
      }
      if (!recordingSessionId && !stopRequestedRef.current) {
        logWarn(
          'AgentOrchestrator',
          'late speechEnd ignored for inactive session',
          {},
        );
        return;
      }
      if (speechEndedRef.current) return;
      logInfo('AgentOrchestrator', 'speech recognition end event', {
        recordingSessionId,
        tMs:
          recordingStartAtRef.current != null
            ? Date.now() - recordingStartAtRef.current
            : undefined,
      });
      speechEndedRef.current = true;
      if (sessionCoordinator.getAudioState() !== 'stopping') {
        const next = settlementCoordinator.getPendingSubmitWhenReady()
          ? 'settling'
          : 'idleReady';
        setAudioState(next, { recordingSessionId, reason: 'speechEnd' });
        sessionCoordinator.setNativeRestartGuardUntil(
          Date.now() + NATIVE_RESTART_GUARD_MS,
        );
      }
      if (
        settlementCoordinator.getPendingSubmitWhenReady() &&
        recordingSessionRef.current ===
          settlementCoordinator.getPendingSubmitSessionId() &&
        !settlementCoordinator.getSettlementResolved()
      ) {
        settlementCoordinator.startQuietWindow(
          recordingSessionId ?? undefined,
          outcome => {
            handleSettlementOutcome(
              outcome,
              'quietWindowExpired',
              recordingSessionId ?? undefined,
            );
          },
        );
      }
    };
    return () => {
      V.onSpeechResults = null;
      V.onSpeechPartialResults = null;
      V.onSpeechError = null;
      V.onSpeechEnd = null;
    };
  }, [
    voiceReady,
    sessionCoordinator,
    settlementCoordinator,
    emitRecoverableFailure,
    playListenIn,
    playListenOut,
    playError,
    listenersRef,
    updateTranscript,
    finalizeTranscriptFromPartial,
    finalizeStop,
    handleSettlementOutcome,
    resolveSettlement,
    setAudioState,
    stopListeningAndRequestSubmit,
  ]);

  // Piper model copy and availability
  useEffect(() => {
    const run = () => {
      const PiperTts = NativeModules.PiperTts ?? require('piper-tts').default;
      const copy =
        typeof PiperTts?.copyModelToFiles === 'function'
          ? PiperTts.copyModelToFiles
          : null;
      if (!copy) return;
      copy()
        .then(
          (path: string) =>
            path && logInfo('Playback', 'Piper model copied to', { path }),
        )
        .catch((e: unknown) =>
          logWarn('Playback', 'Piper copyModelToFiles failed', {
            message: e instanceof Error ? e.message : String(e),
          }),
        );
    };
    run();
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const retryDelaysMs = [0, 800, 1500, 2500, 4000];
      for (const delay of retryDelaysMs) {
        if (cancelled) return;
        if (delay > 0) await new Promise<void>(r => setTimeout(r, delay));
        try {
          const PiperTts = require('piper-tts').default;
          const available = await PiperTts.isModelAvailable();
          if (!cancelled) setPiperAvailable(available);
          if (available) return;
        } catch {
          if (!cancelled) setPiperAvailable(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const emittedLifecycle: AgentLifecycleState = error ? 'error' : lifecycle;

  const requestIdentity = mirrorRequestIdentityFromRefs(
    activeRequestIdRef.current,
    requestInFlightRef.current,
    playbackRequestIdRef.current,
  );

  const state: AgentOrchestratorState = {
    lifecycle: emittedLifecycle,
    processingSubstate:
      emittedLifecycle === 'processing' ? processingSubstate : null,
    error,
    voiceReady,
    transcribedText,
    responseText,
    validationSummary,
    ioBlockedUntil,
    ioBlockedReason,
    audioSessionState,
    recordingSessionId: recordingSessionRef.current,
    lastFrontDoorOutcome,
    metadata: undefined,
    ...requestIdentity,
  };

  const actions = useMemo<AgentOrchestratorActions>(
    () => ({
      startListening,
      stopListening,
      stopListeningAndRequestSubmit,
      submit,
      playText,
      cancelPlayback,
      setTranscribedText,
      clearError,
      reportRecoverableFailure,
      recoverFromRequestFailure,
    }),
    [
      startListening,
      stopListening,
      stopListeningAndRequestSubmit,
      submit,
      playText,
      cancelPlayback,
      setTranscribedText,
      clearError,
      reportRecoverableFailure,
      recoverFromRequestFailure,
    ],
  );

  return { state, actions };
}
