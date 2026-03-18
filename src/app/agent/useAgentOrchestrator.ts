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
} from '../../shared/config/endpointConfig';
import {
  logError,
  logInfo,
  logLifecycle,
  logWarn,
  perfTrace,
} from '../../shared/logging';
import {
  useSttAudioCapture,
  type CapturedSttAudio,
  type SttAudioCaptureFailureKind,
} from '../hooks/useSttAudioCapture';
import { useOpenAIProxy } from '../providers/openAI/useOpenAIProxy';
import { classifyRecoverableFailure } from './failureClassification';
import { emitRequestDebug } from './orchestrator/telemetry';
import { executeRequest } from './request/executeRequest';
import type { RequestDebugEmitPayload } from './requestDebugTypes';
import type {
  AgentLifecycleState,
  AgentOrchestratorListeners,
  AgentOrchestratorState,
  ProcessingSubstate,
} from './types';
import { createRemoteSttCoordinator } from './voice/remoteStt';
import {
  createSessionCoordinator,
  IOS_STOP_GRACE_MS,
  type AudioSessionState,
} from './voice/sessionCoordinator';
import {
  createTranscriptSettlementCoordinator,
  normalizeTranscript,
  transcriptPreview,
  type SettlementOutcome,
} from './voice/transcriptSettlement';
import {
  blockWindowUntil,
  getOnDeviceModelPaths,
  getVoiceNative,
  invokeVoiceStop,
  isRecognizerReentrancyError,
  isRecoverableSpeechError,
  NATIVE_RESTART_GUARD_MS,
  runNativeStopFlow,
} from './voice/voiceNative';
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
  const { listenersRef, requestDebugSinkRef } = options;
  const sttProvider = getSttProvider();
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
  const lastRemoteSttEmptyRef = useRef(false);
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
  } | null>(null);
  const previousCommittedResponseRef = useRef<string | null>(null);
  const previousCommittedValidationRef = useRef<ValidationSummary | null>(null);
  const prevLifecycleRef = useRef<AgentLifecycleState>(lifecycle);
  modeRef.current = mode;
  lifecycleRef.current = lifecycle;

  const playListenIn = useCallback(() => {
    logInfo('AgentOrchestrator', 'voice listen started');
    listenersRef?.current?.onListeningStart?.();
  }, [listenersRef]);
  const playListenOut = useCallback(() => {
    logInfo('AgentOrchestrator', 'voice listen stopped');
  }, []);
  const playError = useCallback(() => {
    listenersRef?.current?.onError?.();
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
          suppressedBy: null as SurfacedFailureSeverity | null,
        };
      }
      const ledger = sessionFailureLedgerRef.current;
      const current = ledger.get(key) ?? {
        strongest: severity,
        recoverableSurfaced: false,
        terminalSurfaced: false,
      };
      let shouldSurface = true;
      let suppressedBy: SurfacedFailureSeverity | null = null;

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
    (message: string, recordingSessionId?: string) => {
      pendingCapturedAudioRef.current = null;
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
        sttProvider,
        endpointBaseUrl: endpointBaseUrl ?? null,
      });
      logError('AgentOrchestrator', 'remote stt transcription failed', {
        recordingSessionId,
        message,
        sttProvider,
        endpointBaseUrl: endpointBaseUrl ?? null,
      });
    },
    [emitTerminalFailure, endpointBaseUrl, setAudioState, sttProvider],
  );
  const handleLocalCaptureFailure = useCallback(
    (
      failureKind: SttAudioCaptureFailureKind,
      message: string,
      recordingSessionId?: string,
    ) => {
      pendingCapturedAudioRef.current = null;
      logWarn('AgentOrchestrator', 'local stt audio capture failed', {
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
        onFailure: failRemoteStt,
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
      if (sttProvider !== 'remote') return true;
      return remoteSttCoordinator.transcribeCapturedAudioIfNeeded(
        recordingSessionId,
      );
    },
    [sttProvider, remoteSttCoordinator],
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
      onSettlementFinalizeComplete(opts);
      logInfo('AgentOrchestrator', 'voice listen stopped', {
        recordingSessionId,
      });
    },
    [listenersRef, onSettlementFinalizeComplete, settlementCoordinator],
  );

  const cleanupPendingIosStopIfNeeded = useCallback(
    async (
      recordingSessionId?: string,
      nextAudioState: 'idleReady' | 'settling' = 'idleReady',
    ) => {
      if (
        Platform.OS !== 'ios' ||
        !sessionCoordinator.getIosStopPending() ||
        sessionCoordinator.getIosStopInvoked()
      ) {
        return;
      }
      logInfo(
        'AgentOrchestrator',
        'cleanup forcing native voice stop before idle',
        { recordingSessionId },
      );
      setAudioState('stopping', { recordingSessionId });
      logInfo('AgentOrchestrator', 'native voice stop in flight', {
        recordingSessionId,
      });
      const V = voiceRef.current;
      await invokeVoiceStop(V, getVoiceNative);
      sessionCoordinator.setIosStopPending(false);
      sessionCoordinator.setIosStopInvoked(true);
      setAudioState(nextAudioState, {
        recordingSessionId,
        reason: 'nativeStopComplete',
      });
      logInfo('AgentOrchestrator', 'native voice stop completed', {
        recordingSessionId,
      });
    },
    [sessionCoordinator, setAudioState],
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
      if (outcome.shouldSubmit) {
        listenersRef?.current?.onTranscriptReadyForSubmit?.();
      }
      const nextAudioState = outcome.shouldSubmit ? 'settling' : 'idleReady';
      setAudioState(nextAudioState, {
        recordingSessionId,
        reason: 'settlementResolved',
      });
      await cleanupPendingIosStopIfNeeded(recordingSessionId, nextAudioState);
      finalizeStop(
        reason,
        recordingSessionId,
        outcome.shouldSubmit ? { keepLifecycle: true } : undefined,
      );
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
      logInfo('AgentOrchestrator', 'native voice stop in flight', {
        recordingSessionId,
      });
      logInfo('AgentOrchestrator', 'voice stop invoked', {
        recordingSessionId,
        platform: Platform.OS,
        pendingSubmitWhenReady,
      });
      if (Platform.OS === 'ios') {
        logInfo('AgentOrchestrator', 'ios stop grace scheduled', {
          recordingSessionId,
          graceMs: IOS_STOP_GRACE_MS,
        });
      } else {
        logInfo(
          'AgentOrchestrator',
          'voice stop invoked immediately (non-ios)',
          {
            recordingSessionId,
          },
        );
      }
      return sessionCoordinator.executeNativeStopWithGrace(
        Platform.OS === 'ios',
        recordingSessionId,
        IOS_STOP_GRACE_MS,
        runStop,
      );
    },
    [sessionCoordinator],
  );

  const stopListening = useCallback(async () => {
    const recordingSessionId = recordingSessionRef.current ?? undefined;
    logInfo('AgentOrchestrator', 'voice listen stop requested', {
      recordingSessionId,
    });
    stopRequestedRef.current = true;
    setAudioState('stopping', { recordingSessionId, reason: 'stopRequested' });
    if (sttProvider === 'remote') {
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
    sttProvider,
    settlementCoordinator,
  ]);

  const stopListeningAndRequestSubmit = useCallback(async () => {
    const recordingSessionId = recordingSessionRef.current ?? undefined;
    perfTrace('AgentOrchestrator', 'stop requested', { recordingSessionId });
    logInfo('AgentOrchestrator', 'voice listen stop requested', {
      recordingSessionId,
    });
    logInfo('AgentOrchestrator', 'transcript finalization started', {
      recordingSessionId,
    });
    stopRequestedRef.current = true;
    setAudioState('stopping', { recordingSessionId, reason: 'stopForSubmit' });
    if (sttProvider === 'remote') {
      const captureResult = await sttAudioCapture.endCapture(
        recordingSessionId,
      );
      perfTrace('AgentOrchestrator', 'audio capture complete', {
        recordingSessionId,
        ok: captureResult.ok,
      });
      if (!captureResult.ok) {
        handleLocalCaptureFailure(
          captureResult.failureKind,
          captureResult.message,
          recordingSessionId,
        );
        finalizeStop('remoteCaptureFailed', recordingSessionId);
        return;
      }
      pendingCapturedAudioRef.current = captureResult.capture;
      setAudioState('settling', {
        recordingSessionId,
        reason: 'remoteCaptureComplete',
      });
      lastRemoteSttEmptyRef.current = false;
      const sttPromise = transcribeCapturedAudioIfNeeded(recordingSessionId);
      const settleTimeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('ORCHESTRATOR_STT_SETTLE_TIMEOUT')),
          ORCHESTRATOR_STT_SETTLE_TIMEOUT_MS,
        ),
      );
      let sttReady: boolean;
      try {
        sttReady = await Promise.race([sttPromise, settleTimeoutPromise]);
      } catch (e) {
        if (
          e instanceof Error &&
          e.message === 'ORCHESTRATOR_STT_SETTLE_TIMEOUT'
        ) {
          logWarn(
            'AgentOrchestrator',
            'orchestrator-level STT settle timeout fired',
            {
              recordingSessionId,
              timeoutMs: ORCHESTRATOR_STT_SETTLE_TIMEOUT_MS,
            },
          );
          failRemoteStt(
            'Remote STT request timed out (orchestrator)',
            recordingSessionId,
          );
          finalizeStop('remoteSttFailed', recordingSessionId, {
            keepLifecycle: true,
          });
          return;
        }
        throw e;
      }
      if (!sttReady) {
        const wasEmptyTranscript = lastRemoteSttEmptyRef.current;
        lastRemoteSttEmptyRef.current = false;
        if (wasEmptyTranscript) {
          emitRecoverableFailure('noUsableTranscript', {
            recordingSessionId,
            reason: 'remoteSttEmptyTranscript',
          });
          setAudioState('idleReady', {
            recordingSessionId,
            reason: 'remoteSttEmptyTranscript',
          });
          finalizeStop('remoteSttEmptyTranscript', recordingSessionId);
        } else {
          finalizeStop('remoteSttFailed', recordingSessionId, {
            keepLifecycle: true,
          });
        }
        return;
      }
      perfTrace('AgentOrchestrator', 'submit.remote_transcript_ready', {
        recordingSessionId,
      });
      logInfo(
        'AgentOrchestrator',
        'submit triggered after remote stt capture',
        {
          recordingSessionId,
          sttProvider,
        },
      );
      listenersRef?.current?.onTranscriptReadyForSubmit?.();
      setAudioState('settling', {
        recordingSessionId,
        reason: 'remoteTranscriptReady',
      });
      finalizeStop('remoteSttSubmitReady', recordingSessionId, {
        keepLifecycle: true,
      });
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
    emitRecoverableFailure,
    finalizeStop,
    failRemoteStt,
    handleLocalCaptureFailure,
    listenersRef,
    resolveSettlement,
    runNativeStopWithLogging,
    setAudioState,
    sessionCoordinator,
    sttAudioCapture,
    sttProvider,
    settlementCoordinator,
    transcribeCapturedAudioIfNeeded,
  ]);

  const startListening = useCallback(
    async (fresh = false): Promise<{ ok: boolean; reason?: string }> => {
      const V = voiceRef.current;
      if (!V && sttProvider !== 'remote') {
        logWarn(
          'AgentOrchestrator',
          'start attempt rejected: voice module unavailable',
        );
        return { ok: false, reason: 'voiceUnavailable' };
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
      perfTrace('AgentOrchestrator', 'voice start requested', {
        recordingSessionId,
        fresh,
        sttProvider,
      });
      logInfo('AgentOrchestrator', 'voice listen start requested', {
        recordingSessionId,
        fresh,
        committedChars: committedTextRef.current.length,
        sttProvider,
        endpointBaseUrl: endpointBaseUrl ?? null,
      });
      recordingStartAtRef.current = Date.now();
      firstPartialAtRef.current = null;
      firstFinalAtRef.current = null;
      setAudioState('starting', { recordingSessionId });
      try {
        if (sttProvider === 'remote') {
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
          const captureStarted = await sttAudioCapture.beginCapture(
            recordingSessionId,
          );
          if (!captureStarted) {
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
          setAudioState('listening', { recordingSessionId });
          clearIoBlock();
          recordingSessionRef.current = recordingSessionId;
          speechEndedRef.current = false;
          perfTrace('AgentOrchestrator', 'voice.listen_active', {
            recordingSessionId,
            sttPath: 'remote',
            startLatencyMs:
              recordingStartAtRef.current != null
                ? Date.now() - recordingStartAtRef.current
                : undefined,
          });
          logInfo('AgentOrchestrator', 'voice listen active', {
            recordingSessionId,
            startLatencyMs:
              recordingStartAtRef.current != null
                ? Date.now() - recordingStartAtRef.current
                : undefined,
          });
          logInfo('AgentOrchestrator', 'start attempt accepted', {
            recordingSessionId,
          });
          playListenIn();
          return { ok: true };
        }
        try {
          await V!.start('en-US');
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const nativeVoice = getVoiceNative();
          if (
            msg.toLowerCase().includes('startspeech is null') &&
            typeof nativeVoice?.startSpeech === 'function'
          ) {
            await nativeVoice.startSpeech('en-US');
          } else {
            throw e;
          }
        }
        setAudioState('listening', { recordingSessionId });
        clearIoBlock();
        recordingSessionRef.current = recordingSessionId;
        speechEndedRef.current = false;
        perfTrace('AgentOrchestrator', 'voice.listen_active', {
          recordingSessionId,
          sttPath: 'on_device',
          startLatencyMs:
            recordingStartAtRef.current != null
              ? Date.now() - recordingStartAtRef.current
              : undefined,
        });
        logInfo('AgentOrchestrator', 'voice listen active', {
          recordingSessionId,
          startLatencyMs:
            recordingStartAtRef.current != null
              ? Date.now() - recordingStartAtRef.current
              : undefined,
        });
        logInfo('AgentOrchestrator', 'start attempt accepted', {
          recordingSessionId,
        });
        playListenIn();
        return { ok: true };
      } catch (e) {
        if (sttProvider === 'remote') {
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
      clearIoBlock,
      endpointBaseUrl,
      mode,
      playListenIn,
      setAudioState,
      sessionCoordinator,
      settlementCoordinator,
      sttAudioCapture,
      sttProvider,
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
    requestIdRef.current += 1;
    const reqId = requestIdRef.current;
    perfTrace('AgentOrchestrator', 'submit.run_request', {
      requestId: reqId,
    });
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
    perfTrace('AgentOrchestrator', 'request started', {
      requestId: reqId,
      requestStartTime: requestStartedAt,
    });
    emitRequestDebug(requestDebugSinkRef, {
      type: 'request_start',
      requestId: reqId,
      acceptedTranscript: transcribedTextRef.current,
      normalizedTranscript: question,
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
    const retrievalStartedAt = Date.now();
    emitRequestDebug(requestDebugSinkRef, {
      type: 'retrieval_start',
      requestId: reqId,
      retrievalStartedAt,
      timestamp: retrievalStartedAt,
    });
    logInfo('AgentOrchestrator', 'retrieval started', { requestId: reqId });
    listenersRef?.current?.onRetrievalStart?.();
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
      });
    } catch {
      perfTrace('AgentOrchestrator', 'request failed', {
        requestId: reqId,
        requestEnd: true,
      });
      requestInFlightRef.current = false;
      setAudioState('idleReady', { reason: 'requestFailed' });
      return null;
    }
    if (!runResult || runResult.status === 'stale') {
      requestInFlightRef.current = false;
      return null;
    }
    if (runResult.status === 'failed') {
      perfTrace('AgentOrchestrator', 'request failed', {
        requestId: reqId,
        requestEnd: true,
      });
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
      setError(runResult.displayMessage);
      listenersRef?.current?.onError?.(runResult.classification.kind, {
        stage: runResult.classification.stage,
        recoverability: runResult.classification.recoverability,
        transientEvent: runResult.classification.transientEvent,
        telemetryReason: runResult.classification.telemetryReason,
      });
      return null;
    }
    requestInFlightRef.current = false;
    setError(null);
    setProcessingSubstate(null);
    emitRequestDebug(requestDebugSinkRef, {
      type: 'processing_substate',
      requestId: reqId,
      processingSubstate: null,
      timestamp: Date.now(),
    });
    if (runResult.shouldPlay) {
      playbackRequestIdRef.current = reqId;
      logInfo(
        'ResponseSurface',
        'response_surface_playback_bound_to_committed_response',
        {
          requestId: reqId,
          speakingBoundToCommittedResponse: true,
          committedChars: runResult.committedText.length,
        },
      );
      playTextRef.current?.(runResult.committedText).catch(() => undefined);
      return runResult.committedText;
    }
    // When not playing: transition to idle. When shouldPlay we skip this so playText() sets speaking (avoids processing->idle->speaking and idle fan-out cost).
    setMode('idle');
    setLifecycle('idle');
    if (!runResult.shouldPlay) {
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
  }, [listenersRef, requestDebugSinkRef, setAudioState]);

  const playText = useCallback(
    async (text: string) => {
      const normalized = text.trim();
      if (!normalized) {
        logWarn('AgentOrchestrator', 'playback skipped: empty text');
        return;
      }
      setError(null);
      playbackInterruptedRef.current = false;
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
        setProcessingSubstate(null);
        setMode('speaking');
        setLifecycle('speaking');
        const ttsStartedAt = Date.now();
        emitRequestDebug(requestDebugSinkRef, {
          type: 'tts_start',
          requestId: playbackRequestIdRef.current,
          ttsStartedAt,
          timestamp: ttsStartedAt,
          lifecycle: 'speaking',
        });
        logInfo('AgentOrchestrator', 'playback started', { provider: 'piper' });
        listenersRef?.current?.onPlaybackStart?.();
        try {
          await PiperTts.speak(normalized);
        } catch (e) {
          if (!playbackInterruptedRef.current) {
            const message =
              e instanceof Error ? e.message : 'Piper playback failed';
            setError(message);
            logError('Playback', 'piper playback failed', {
              message,
              textChars: normalized.length,
            });
          }
        } finally {
          const ttsEndedAt = Date.now();
          const reqIdForLog = playbackRequestIdRef.current;
          emitRequestDebug(requestDebugSinkRef, {
            type: 'tts_end',
            requestId: reqIdForLog,
            ttsEndedAt,
            timestamp: ttsEndedAt,
            lifecycle: 'idle',
          });
          if (reqIdForLog != null) {
            pendingPlaybackCompleteRef.current = {
              requestId: reqIdForLog,
              endedAt: ttsEndedAt,
            };
          }
          playbackRequestIdRef.current = null;
          setProcessingSubstate(null);
          setMode('idle');
          setLifecycle('idle');
          setAudioState('idleReady', { reason: 'playbackComplete' });
          logInfo('AgentOrchestrator', 'playback completed');
          listenersRef?.current?.onPlaybackEnd?.();
        }
        return;
      }
      let Tts: TtsModule;
      try {
        Tts = require('react-native-tts').default as TtsModule;
        ttsRef.current = Tts;
      } catch (e) {
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
        const reqIdForTts = playbackRequestIdRef.current;
        const onFinish = () => {
          const ttsEndedAt = Date.now();
          emitRequestDebug(requestDebugSinkRef, {
            type: 'tts_end',
            requestId: reqIdForTts,
            ttsEndedAt,
            timestamp: ttsEndedAt,
            lifecycle: 'idle',
          });
          if (reqIdForTts != null) {
            pendingPlaybackCompleteRef.current = {
              requestId: reqIdForTts,
              endedAt: ttsEndedAt,
            };
          }
          playbackRequestIdRef.current = null;
          setProcessingSubstate(null);
          setMode('idle');
          setLifecycle('idle');
          setAudioState('idleReady', { reason: 'playbackComplete' });
          logInfo('AgentOrchestrator', 'playback completed');
          listenersRef?.current?.onPlaybackEnd?.();
          try {
            if (typeof Tts.removeEventListener === 'function') {
              Tts.removeEventListener('tts-finish', onFinish);
              Tts.removeEventListener('tts-cancel', onFinish);
            }
          } catch {
            /* ignore */
          }
        };
        Tts.addEventListener('tts-finish', onFinish);
        Tts.addEventListener('tts-cancel', onFinish);
        setProcessingSubstate(null);
        setMode('speaking');
        setLifecycle('speaking');
        const ttsStartedAt = Date.now();
        emitRequestDebug(requestDebugSinkRef, {
          type: 'tts_start',
          requestId: reqIdForTts,
          ttsStartedAt,
          timestamp: ttsStartedAt,
          lifecycle: 'speaking',
        });
        logInfo('AgentOrchestrator', 'playback started', {
          provider: 'react-native-tts',
        });
        listenersRef?.current?.onPlaybackStart?.();
        Tts.speak(normalized);
      } catch (e) {
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
          // TTS error before tts_end: we do not emit request_complete. request_complete is only emitted
          // after tts_end (via pendingPlaybackCompleteRef effect). Playback failure leaves lifecycle 'error' for user recovery.
        }
      }
    },
    [piperAvailable, listenersRef, requestDebugSinkRef, setAudioState],
  );

  playTextRef.current = playText;

  const cancelPlayback = useCallback(() => {
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
    setProcessingSubstate(null);
    setMode('idle');
    setLifecycle('idle');
    listenersRef?.current?.onPlaybackEnd?.();
    setTimeout(() => {
      playbackInterruptedRef.current = false;
    }, 120);
  }, [listenersRef]);

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
    if (lifecycle !== 'idle') return;
    const pending = pendingPlaybackCompleteRef.current;
    if (!pending) return;
    pendingPlaybackCompleteRef.current = null;
    emitRequestDebug(requestDebugSinkRef, {
      type: 'request_complete',
      requestId: pending.requestId,
      status: 'completed',
      completedAt: pending.endedAt,
      lifecycle: 'idle',
      timestamp: pending.endedAt,
    });
    logInfo('AgentOrchestrator', 'request_complete', {
      requestId: pending.requestId,
      lifecycle: 'idle',
    });
    activeRequestIdRef.current = 0;
    logInfo('AgentOrchestrator', 'active requestId cleared', {
      requestId: pending.requestId,
    });
    logInfo('ResponseSurface', 'response_surface_concealed_after_playback', {
      requestId: pending.requestId,
      lifecycle: 'idle',
      reason: 'playbackComplete',
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
      if (speechEndedRef.current) {
        const normalizedIncoming = normalizeTranscript(next);
        logInfo(
          'AgentOrchestrator',
          'final ignored because speechEndedRef=true',
          {
            recordingSessionId: sessionId,
            pendingSubmitWhenReady:
              settlementCoordinator.getPendingSubmitWhenReady(),
            settlementResolved: settlementCoordinator.getSettlementResolved(),
            finalStabilizationActive:
              settlementCoordinator.getFinalStabilizationActive(),
            incomingChunkChars: normalizedIncoming.length,
            incomingTranscriptText: normalizedIncoming,
            incomingTranscriptPreview: transcriptPreview(normalizedIncoming),
          },
        );
        return;
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
    metadata: undefined,
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
