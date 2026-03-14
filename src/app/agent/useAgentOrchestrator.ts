/**
 * AgentOrchestrator: single source of truth for agent lifecycle.
 * Owns voice input, request, retrieval/generation, playback, cancellation.
 * Does not know visualization, panel layout, or render-layer details.
 * Emits normalized state and optional listener callbacks for VisualizationController.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, NativeModules, type AppStateStatus } from 'react-native';
import { getEndpointBaseUrl, getSttProvider } from '../endpointConfig';
import { useSttAudioCapture, type CapturedSttAudio } from '../hooks/useSttAudioCapture';
import { useOpenAIProxy } from '../providers/openAI/useOpenAIProxy';
import {
  BUNDLE_PACK_ROOT,
  copyBundlePackToDocuments,
  createBundlePackReader,
  createDocumentsPackReader,
  createThrowReader,
  getContentPackPathInDocuments,
  getPackEmbedModelId,
  getPackState,
  ask as ragAsk,
  init as ragInit,
  type ValidationSummary,
} from '../../rag';
import { logInfo, logLifecycle, logWarn, logError } from '../../shared/logging';
import {
  classifyRecoverableFailure,
  classifyTerminalFailure,
} from './failureClassification';
import type {
  AgentLifecycleState,
  AgentOrchestratorListeners,
  AgentOrchestratorState,
  ProcessingSubstate,
} from './types';
import type { RequestDebugEmitPayload } from './requestDebugTypes';

const BUNDLE_MODEL_PREFIXES = Array.from(
  new Set([BUNDLE_PACK_ROOT, '', 'content_pack'].filter(Boolean)),
);
const BUNDLE_EMBED_PATH_CANDIDATES = BUNDLE_MODEL_PREFIXES.map(
  prefix => `${prefix}/models/embed/embed.gguf`,
);
const BUNDLE_LLM_PATH_CANDIDATES = BUNDLE_MODEL_PREFIXES.map(
  prefix => `${prefix}/models/llm/model.gguf`,
);
const EMBED_MODEL_FILENAME = 'nomic-embed-text.gguf';
const CHAT_MODEL_FILENAME = 'model.gguf';
/** Short window after speechEnd to wait for final transcript before settling on partial; avoids truncating last word. */
const POST_SPEECH_END_QUIET_WINDOW_MS = 200;
/** Short window after first final to allow a better final before settlement; refines candidate only, does not authorize settlement. */
const POST_FINAL_STABILIZATION_WINDOW_MS = 120;
/** Bounded post-stop flush window: settlement allowed after this from stop-request anchor if speechEnd has not arrived. Single anchor, not mixed per path. */
const POST_STOP_FLUSH_WINDOW_MS = 400;
const IOS_STOP_GRACE_MS = 250;
const REMOTE_STT_CAPTURE_WAIT_MS = 800;
const REMOTE_STT_CAPTURE_POLL_MS = 25;
/** Min ms between partial_output emissions to request-debug (throttle). */
const PARTIAL_EMIT_THROTTLE_MS = 400;
/** Throttle setResponseText during streaming to reduce re-renders (plan: 100–200 ms). */
const RESPONSE_TEXT_UPDATE_THROTTLE_MS = 150;
/** Settlement-time empty-output handling only; orchestrator commits this before settlement. Not the processingSubstate 'fallback' branch. */
const EMPTY_RESPONSE_FALLBACK_MESSAGE = 'No answer generated';
const NATIVE_RESTART_GUARD_MS = 250;
const ANDROID_TAIL_GRACE_MS = 200;
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

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

function transcriptPreview(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 117)}...`;
}

function normalizeTranscript(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function transcriptTrace(text: string): {
  chars: number;
  text: string;
  preview: string;
} {
  const normalized = normalizeTranscript(text);
  return {
    chars: normalized.length,
    text: normalized,
    preview: transcriptPreview(normalized),
  };
}

function summarizeValidationSummary(validationSummary: ValidationSummary): {
  cards: string[];
  rules: string[];
} {
  return {
    cards: validationSummary.cards.map(card => card.canonical ?? card.raw),
    rules: validationSummary.rules.map(rule => rule.canonical ?? rule.raw),
  };
}

function isRecognizerReentrancyError(message: string): boolean {
  return message.toLowerCase().includes('already started');
}

function blockWindowUntil(now: number): number {
  return now + NATIVE_RESTART_GUARD_MS;
}

function isRecoverableSpeechError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('no match') ||
    m.includes("didn't understand") ||
    m.includes('no speech') ||
    m.startsWith('7/') ||
    m.startsWith('11/')
  );
}

function getVoiceNative() {
  const direct = (NativeModules?.Voice ?? null) as {
    startSpeech?: (locale: string, opts?: object, cb?: (e?: string) => void) => void;
    stopSpeech?: (cb?: (e?: string) => void) => void;
  } | null;
  const rct = (NativeModules?.RCTVoice ?? null) as {
    startSpeech?: (locale: string, opts?: object, cb?: (e?: string) => void) => void;
    stopSpeech?: (cb?: (e?: string) => void) => void;
  } | null;
  if (direct?.startSpeech || direct?.stopSpeech) return direct;
  if (rct?.startSpeech || rct?.stopSpeech) return rct;
  return direct ?? rct ?? null;
}

async function getOnDeviceModelPaths(packRootInDocuments?: string): Promise<{
  embedModelPath: string;
  chatModelPath: string;
}> {
  const RagPackReader =
    NativeModules.RagPackReader ?? NativeModules.RagPackReaderModule;
  if (!RagPackReader) return { embedModelPath: '', chatModelPath: '' };

  let embedModelPath = '';
  let chatModelPath = '';
  let modelsDir = '';

  const fileExists = async (absolutePath: string): Promise<boolean> => {
    if (!absolutePath || typeof absolutePath !== 'string') return false;
    if (typeof RagPackReader.fileExistsAtPath !== 'function') return true;
    try {
      return !!(await RagPackReader.fileExistsAtPath(absolutePath));
    } catch {
      return false;
    }
  };

  const resolveBundleModelPath = async (candidates: string[]): Promise<string> => {
    if (typeof RagPackReader.getBundleFilePath !== 'function') return '';
    for (const candidate of candidates) {
      try {
        const resolved = await RagPackReader.getBundleFilePath(candidate);
        if (resolved && (await fileExists(resolved))) return resolved;
      } catch {
        /* try next */
      }
    }
    return '';
  };

  if (packRootInDocuments?.trim()) {
    const root = packRootInDocuments.replace(/\/+$/, '');
    if (typeof RagPackReader.readFileAtPath === 'function') {
      try {
        const manifestJson = await RagPackReader.readFileAtPath(`${root}/manifest.json`);
        const manifest = JSON.parse(manifestJson) as {
          models?: { llm?: { file?: string }; embed?: { file?: string } };
        };
        const llmFile = manifest?.models?.llm?.file;
        const embedFile = manifest?.models?.embed?.file;
        if (llmFile && (await fileExists(`${root}/${llmFile}`)))
          chatModelPath = `${root}/${llmFile}`;
        if (embedFile && (await fileExists(`${root}/${embedFile}`)))
          embedModelPath = `${root}/${embedFile}`;
      } catch {
        /* use fallbacks */
      }
    }
    const packEmbed = `${root}/models/embed/embed.gguf`;
    const packLlm = `${root}/models/llm/model.gguf`;
    if (!embedModelPath && (await fileExists(packEmbed))) embedModelPath = packEmbed;
    if (!chatModelPath && (await fileExists(packLlm))) chatModelPath = packLlm;
  }

  if (!embedModelPath || !chatModelPath) {
    try {
      const [embedPath, llmPath] = await Promise.all([
        resolveBundleModelPath(BUNDLE_EMBED_PATH_CANDIDATES),
        resolveBundleModelPath(BUNDLE_LLM_PATH_CANDIDATES),
      ]);
      if (embedPath && !embedModelPath) embedModelPath = embedPath;
      if (llmPath && !chatModelPath) chatModelPath = llmPath;
    } catch {
      /* bundle not available */
    }
  }

  if (!embedModelPath || !chatModelPath) {
    try {
      if (RagPackReader.getAppModelsPath) {
        modelsDir = await RagPackReader.getAppModelsPath();
        if (modelsDir && typeof modelsDir === 'string') {
          const dir = modelsDir.replace(/\/+$/, '');
          if (!embedModelPath && (await fileExists(`${dir}/${EMBED_MODEL_FILENAME}`)))
            embedModelPath = `${dir}/${EMBED_MODEL_FILENAME}`;
          if (!chatModelPath && (await fileExists(`${dir}/${CHAT_MODEL_FILENAME}`)))
            chatModelPath = `${dir}/${CHAT_MODEL_FILENAME}`;
        }
      }
    } catch {
      /* app models path not available */
    }
  }

  if (embedModelPath || chatModelPath) {
    logInfo('Runtime', 'Model paths', { embed: embedModelPath || null, chat: chatModelPath || null });
  }
  return { embedModelPath, chatModelPath };
}

/** Sink for request-scoped debug telemetry: (payload) => void. Payload must include type and requestId. */
export type RequestDebugSink = (payload: RequestDebugEmitPayload & { type: string }) => void;

export interface UseAgentOrchestratorOptions {
  /** Optional ref to listeners; orchestrator will call these on lifecycle events. */
  listenersRef?: React.RefObject<AgentOrchestratorListeners | null>;
  /** Optional ref to request-debug sink; orchestrator will emit lifecycle events here. */
  requestDebugSinkRef?: React.RefObject<RequestDebugSink | null>;
}

export interface AgentOrchestratorActions {
  startListening: (fresh?: boolean) => Promise<{ ok: boolean; reason?: string }>;
  stopListening: () => Promise<void>;
  /** For hold-to-speak release: stop and request submit only after transcript settlement. Submit must be triggered via onTranscriptReadyForSubmit. */
  stopListeningAndRequestSubmit: () => Promise<void>;
  submit: () => Promise<string | null>;
  playText: (text: string) => Promise<void>;
  cancelPlayback: () => void;
  setTranscribedText: (text: string) => void;
  clearError: () => void;
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

  const [mode, setMode] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
  const [lifecycle, setLifecycle] = useState<AgentLifecycleState>('idle');
  const [processingSubstate, setProcessingSubstate] = useState<ProcessingSubstate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [responseText, setResponseText] = useState<string | null>(null);
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [piperAvailable, setPiperAvailable] = useState<boolean | null>(null);
  const [ioBlockedUntil, setIoBlockedUntil] = useState<number | null>(null);
  const [ioBlockedReason, setIoBlockedReason] = useState<string | null>(null);

  const voiceRef = useRef<VoiceModule | null>(null);
  const ttsRef = useRef<TtsModule | null>(null);
  const transcribedTextRef = useRef('');
  const responseTextRef = useRef<string | null>(responseText);
  const validationSummaryRef = useRef<ValidationSummary | null>(validationSummary);
  const committedTextRef = useRef('');
  const partialTranscriptRef = useRef('');
  const speechEndedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizeInFlightRef = useRef(false);
  const modeRef = useRef(mode);
  const lifecycleRef = useRef(lifecycle);
  const playbackInterruptedRef = useRef(false);
  const requestIdRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const activeRequestIdRef = useRef(0);
  /** Tracks whether onFirstToken was fired for the current request (streaming); must not refire on late chunks. */
  const firstChunkSentRef = useRef(false);
  /** Throttle partial_output: last time we emitted to request-debug sink. */
  const lastPartialEmitAtRef = useRef(0);
  /** Last time we called setResponseText during streaming (throttle). */
  const lastResponseTextUpdateAtRef = useRef(0);
  /** RequestId for the request whose response is currently playing (for tts_start/tts_end). */
  const playbackRequestIdRef = useRef<number | null>(null);
  const recordingSessionRef = useRef<string | null>(null);
  const recordingSessionSeqRef = useRef(0);
  const pendingCapturedAudioRef = useRef<CapturedSttAudio | null>(null);
  const pendingSubmitWhenReadyRef = useRef(false);
  const pendingSubmitSessionIdRef = useRef<string | null>(null);
  const settlementResolvedRef = useRef(false);
  /** Session for which settlement already ran; later events for this session are ignored or downgraded. */
  const lastSettledSessionIdRef = useRef<string | null>(null);
  /** Timer for post-speechEnd quiet window; cancelled when settlement resolves or session ends. */
  const quietWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tailGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tailGraceSessionIdRef = useRef<string | null>(null);
  const recordingStartAtRef = useRef<number | null>(null);
  const firstPartialAtRef = useRef<number | null>(null);
  const firstFinalAtRef = useRef<number | null>(null);
  const lastPartialNormalizedRef = useRef('');
  /** Timer for post-final stabilization window. */
  const finalStabilizationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalStabilizationActiveRef = useRef(false);
  const finalCandidateTextRef = useRef<string | null>(null);
  const finalCandidateSessionIdRef = useRef<string | null>(null);
  /** Single anchor for flush-boundary readiness: timestamp when stop was requested (submit path). Settlement allowed only after speechEnd or POST_STOP_FLUSH_WINDOW_MS from this. */
  const flushBoundaryAnchorAtRef = useRef<number | null>(null);
  const iosStopGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iosStopPendingRef = useRef(false);
  const iosStopInvokedRef = useRef(false);
  const audioStateRef = useRef<'idleReady' | 'starting' | 'listening' | 'stopping' | 'settling'>('idleReady');
  const nativeRestartGuardUntilRef = useRef(0);
  const playTextRef = useRef<(text: string) => Promise<void>>(null);
  const ioBlockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPlaybackCompleteRef = useRef<{ requestId: number; endedAt: number } | null>(null);
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
  const emitRecoverableFailure = useCallback(
    (reason: string, details?: Record<string, unknown>) => {
      const classification = classifyRecoverableFailure(reason);
      listenersRef?.current?.onRecoverableFailure?.(classification.kind, {
        ...details,
        stage: classification.stage,
        recoverability: classification.recoverability,
        transientEvent: classification.transientEvent,
        telemetryReason: classification.telemetryReason,
      });
      const requestId = activeRequestIdRef.current;
      requestDebugSinkRef?.current?.({
        type: 'recoverable_failure',
        requestId: requestId !== 0 ? requestId : null,
        reason: classification.telemetryReason,
        timestamp: Date.now(),
      });
    },
    [listenersRef, requestDebugSinkRef],
  );

  const setAudioState = useCallback(
    (next: 'idleReady' | 'starting' | 'listening' | 'stopping' | 'settling', context?: object) => {
      const prev = audioStateRef.current;
      if (prev === next) return;
      audioStateRef.current = next;
      logInfo('AgentOrchestrator', 'audio session transition', { from: prev, to: next, ...context });
      if (next === 'listening') {
        setMode('listening');
        setLifecycle('listening');
      } else if (next === 'idleReady') {
        if (modeRef.current === 'listening') setMode('idle');
        if (lifecycleRef.current === 'listening' || lifecycleRef.current === 'idle') {
          setProcessingSubstate(null);
          setLifecycle('idle');
        }
      }
    },
    [],
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
      setAudioState('idleReady', { recordingSessionId, reason: 'sttProxyFailed' });
      setError(message);
      setProcessingSubstate(null);
      setMode('idle');
      setLifecycle('error');
      listenersRef?.current?.onError?.('sttProxyFailed', {
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
    [endpointBaseUrl, listenersRef, setAudioState, sttProvider],
  );

  const transcribeCapturedAudioIfNeeded = useCallback(
    async (recordingSessionId?: string): Promise<boolean> => {
      if (sttProvider !== 'remote') return true;
      if (!pendingCapturedAudioRef.current) {
        logInfo('AgentOrchestrator', 'waiting for remote stt capture to finalize', {
          recordingSessionId,
          waitMs: REMOTE_STT_CAPTURE_WAIT_MS,
        });
        const deadline = Date.now() + REMOTE_STT_CAPTURE_WAIT_MS;
        while (!pendingCapturedAudioRef.current && Date.now() < deadline) {
          await new Promise<void>(resolve =>
            setTimeout(() => resolve(), REMOTE_STT_CAPTURE_POLL_MS),
          );
        }
      }
      const capturedAudio = pendingCapturedAudioRef.current;
      if (!capturedAudio) {
        failRemoteStt('Remote STT audio capture produced no uploadable audio', recordingSessionId);
        return false;
      }
      logInfo('AgentOrchestrator', 'remote stt transcription requested', {
        recordingSessionId,
        sttProvider,
        endpointBaseUrl: endpointBaseUrl ?? null,
        filename: capturedAudio.filename,
        durationMillis: capturedAudio.durationMillis,
        sizeBase64Chars: capturedAudio.audioBase64.length,
      });
      try {
        const result = await transcribeAudio({
          audioBase64: capturedAudio.audioBase64,
          mimeType: capturedAudio.mimeType,
          filename: capturedAudio.filename,
          language: 'en',
        });
        const normalized = normalizeTranscript(result.text);
        if (!normalized) {
          failRemoteStt('STT transcription returned no text', recordingSessionId);
          return false;
        }
        pendingCapturedAudioRef.current = null;
        committedTextRef.current = normalized;
        partialTranscriptRef.current = '';
        updateTranscript(normalized);
        logInfo('AgentOrchestrator', 'remote stt transcription succeeded', {
          recordingSessionId,
          transcriptChars: normalized.length,
          transcriptText: normalized,
          transcriptPreview: transcriptPreview(normalized),
        });
        return true;
      } catch (error) {
        failRemoteStt(errorMessage(error), recordingSessionId);
        return false;
      }
    },
    [endpointBaseUrl, failRemoteStt, sttProvider, transcribeAudio, updateTranscript],
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
      logInfo('AgentOrchestrator', 'transcript final synthesized from partial', {
        recordingSessionId,
        totalChars: fallback.length,
        transcriptText: fallback,
        transcriptPreview: transcriptPreview(fallback),
        reason,
      });
    },
    [updateTranscript],
  );

  const finalizeStop = useCallback(
    (reason: string, recordingSessionId?: string, opts?: { keepLifecycle?: boolean }) => {
      if (finalizeInFlightRef.current) return;
      finalizeInFlightRef.current = true;
      if (finalizeTimerRef.current) {
        clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
      if (quietWindowTimerRef.current) {
        clearTimeout(quietWindowTimerRef.current);
        quietWindowTimerRef.current = null;
      }
      if (tailGraceTimerRef.current) {
        clearTimeout(tailGraceTimerRef.current);
        tailGraceTimerRef.current = null;
      }
      tailGraceSessionIdRef.current = null;
      if (finalStabilizationTimerRef.current) {
        clearTimeout(finalStabilizationTimerRef.current);
        finalStabilizationTimerRef.current = null;
      }
      if (iosStopGraceTimerRef.current) {
        if (Platform.OS === 'ios' && iosStopPendingRef.current && !iosStopInvokedRef.current) {
          logInfo('AgentOrchestrator', 'pending ios stop preserved through settlement', {
            recordingSessionId,
          });
        } else {
          clearTimeout(iosStopGraceTimerRef.current);
          iosStopGraceTimerRef.current = null;
        }
      }
      flushBoundaryAnchorAtRef.current = null;
      finalStabilizationActiveRef.current = false;
      finalCandidateTextRef.current = null;
      finalCandidateSessionIdRef.current = null;
      pendingSubmitWhenReadyRef.current = false;
      pendingSubmitSessionIdRef.current = null;
      settlementResolvedRef.current = false;
      pendingCapturedAudioRef.current = null;
      finalizeTranscriptFromPartial(reason, recordingSessionId);
      if (!opts?.keepLifecycle) {
        setProcessingSubstate(null);
        setMode('idle');
        setLifecycle('idle');
      }
      logInfo('AgentOrchestrator', 'voice listen stopped', { recordingSessionId });
      recordingSessionRef.current = null;
      partialTranscriptRef.current = '';
      speechEndedRef.current = false;
      stopRequestedRef.current = false;
      listenersRef?.current?.onListeningEnd?.();
      finalizeInFlightRef.current = false;
    },
    [finalizeTranscriptFromPartial, listenersRef],
  );

  const resolveSettlement = useCallback(
    async (reason: string, recordingSessionId?: string) => {
      if (settlementResolvedRef.current) return;
      const capturedFinalCandidate = finalCandidateTextRef.current ?? '';
      const capturedPartialNorm = normalizeTranscript(partialTranscriptRef.current);
      if (
        reason === 'flushWindowExpired' &&
        Platform.OS === 'android' &&
        !speechEndedRef.current
      ) {
        const bestByLength =
          capturedFinalCandidate.length >= capturedPartialNorm.length
            ? capturedFinalCandidate
            : capturedPartialNorm;
        const sessionKey = recordingSessionId ?? null;
        if (
          bestByLength &&
          !tailGraceTimerRef.current &&
          tailGraceSessionIdRef.current !== sessionKey
        ) {
          tailGraceSessionIdRef.current = sessionKey;
          tailGraceTimerRef.current = setTimeout(() => {
            tailGraceTimerRef.current = null;
            void resolveSettlement('tailGraceExpired', recordingSessionId);
          }, ANDROID_TAIL_GRACE_MS);
          logInfo('AgentOrchestrator', 'android tail grace scheduled before fallback commit', {
            recordingSessionId,
            graceMs: ANDROID_TAIL_GRACE_MS,
            candidateChars: bestByLength.length,
            candidateTranscriptText: bestByLength,
            candidateTranscriptPreview: transcriptPreview(bestByLength),
          });
          return;
        }
      }
      settlementResolvedRef.current = true;
      const shouldSubmit = pendingSubmitWhenReadyRef.current;
      if (recordingSessionId) lastSettledSessionIdRef.current = recordingSessionId;
      if (finalizeTimerRef.current) {
        clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
      if (quietWindowTimerRef.current) {
        clearTimeout(quietWindowTimerRef.current);
        quietWindowTimerRef.current = null;
      }
      if (finalStabilizationTimerRef.current) {
        clearTimeout(finalStabilizationTimerRef.current);
        finalStabilizationTimerRef.current = null;
      }
      if (tailGraceTimerRef.current) {
        clearTimeout(tailGraceTimerRef.current);
        tailGraceTimerRef.current = null;
      }
      tailGraceSessionIdRef.current = null;
      if (iosStopGraceTimerRef.current) {
        if (Platform.OS === 'ios' && iosStopPendingRef.current && !iosStopInvokedRef.current) {
          logInfo('AgentOrchestrator', 'pending ios stop preserved through settlement', {
            recordingSessionId,
          });
        } else {
          clearTimeout(iosStopGraceTimerRef.current);
          iosStopGraceTimerRef.current = null;
        }
      }
      flushBoundaryAnchorAtRef.current = null;
      finalStabilizationActiveRef.current = false;
      finalCandidateTextRef.current = null;
      finalCandidateSessionIdRef.current = null;
      pendingSubmitWhenReadyRef.current = false;
      pendingSubmitSessionIdRef.current = null;
      if (reason === 'timeout' || reason === 'flushWindowExpired' || reason === 'tailGraceExpired') {
        const bestByLength =
          capturedFinalCandidate.length >= capturedPartialNorm.length
            ? capturedFinalCandidate
            : capturedPartialNorm;
        logInfo('AgentOrchestrator', 'settlement candidate comparison', {
          recordingSessionId,
          reason,
          finalCandidateChars: capturedFinalCandidate.length,
          finalCandidateText: capturedFinalCandidate,
          finalCandidatePreview: transcriptPreview(capturedFinalCandidate),
          partialCandidateChars: capturedPartialNorm.length,
          partialCandidateText: capturedPartialNorm,
          partialCandidatePreview: transcriptPreview(capturedPartialNorm),
          chosenCandidateChars: bestByLength.length,
          chosenCandidateText: bestByLength,
          chosenCandidatePreview: transcriptPreview(bestByLength),
        });
        if (bestByLength) {
          updateTranscript(bestByLength);
        } else {
          finalizeTranscriptFromPartial(reason, recordingSessionId);
        }
        logInfo('AgentOrchestrator', 'flush boundary fallback settling candidate after stop completion', {
          recordingSessionId,
          candidateChars: capturedFinalCandidate.length,
          candidateTranscriptText: capturedFinalCandidate,
          speechEnded: speechEndedRef.current,
          audioStopping: audioStateRef.current === 'stopping',
          quietWindowActive: !!quietWindowTimerRef.current,
          finalStabilizationActive: finalStabilizationActiveRef.current,
        });
        logInfo('AgentOrchestrator', 'flush-boundary settlement (flush window or timeout)', {
          recordingSessionId,
          hadFinal: !!capturedFinalCandidate,
          hadPartial: !!capturedPartialNorm,
        });
        const normalized = normalizeTranscript(transcribedTextRef.current);
        if (!normalized) {
          logLifecycle('AgentOrchestrator', 'lifecycle transition listening -> idle', {
            recordingSessionId,
            reason: 'speech capture failed: no usable transcript',
          });
          logWarn('AgentOrchestrator', 'timeout settlement produced empty transcript; submit skipped', {
            recordingSessionId,
          });
          emitRecoverableFailure('noUsableTranscript', { recordingSessionId, reason });
          setProcessingSubstate(null);
          setMode('idle');
          setLifecycle('idle');
          setAudioState('idleReady', { recordingSessionId, reason: 'noUsableTranscript' });
          logInfo('AgentOrchestrator', 'recoverable attempt failed; returning to idle-ready state');
          finalizeStop(reason, recordingSessionId, { keepLifecycle: true });
          return;
        }
      } else if (reason === 'speechEnd') {
        // speechEnd uses quiet-window path; avoid immediate fallback here
      } else if (reason === 'quietWindowExpired') {
        const bestByLength =
          capturedFinalCandidate.length >= capturedPartialNorm.length
            ? capturedFinalCandidate
            : capturedPartialNorm;
        logInfo('AgentOrchestrator', 'quiet window resolved at flush boundary', {
          recordingSessionId,
          hadFinal: !!capturedFinalCandidate,
          hadPartial: !!capturedPartialNorm,
        });
        logInfo('AgentOrchestrator', 'settlement candidate comparison', {
          recordingSessionId,
          reason,
          finalCandidateChars: capturedFinalCandidate.length,
          finalCandidateText: capturedFinalCandidate,
          finalCandidatePreview: transcriptPreview(capturedFinalCandidate),
          partialCandidateChars: capturedPartialNorm.length,
          partialCandidateText: capturedPartialNorm,
          partialCandidatePreview: transcriptPreview(capturedPartialNorm),
          chosenCandidateChars: bestByLength.length,
          chosenCandidateText: bestByLength,
          chosenCandidatePreview: transcriptPreview(bestByLength),
        });
        if (bestByLength) {
          updateTranscript(bestByLength);
        } else {
          finalizeTranscriptFromPartial('quietWindowExpired', recordingSessionId);
        }
        const normalized = normalizeTranscript(transcribedTextRef.current);
        if (!normalized) {
          logLifecycle('AgentOrchestrator', 'lifecycle transition listening -> idle', {
            recordingSessionId,
            reason: 'speech capture failed: no usable transcript',
          });
          logWarn('AgentOrchestrator', 'quiet window produced empty transcript; submit skipped', {
            recordingSessionId,
          });
          emitRecoverableFailure('noUsableTranscript', { recordingSessionId, reason: 'quietWindowExpired' });
          setProcessingSubstate(null);
          setMode('idle');
          setLifecycle('idle');
          setAudioState('idleReady', { recordingSessionId, reason: 'noUsableTranscript' });
          logInfo('AgentOrchestrator', 'recoverable attempt failed; returning to idle-ready state');
          finalizeStop('quietWindowExpired', recordingSessionId, { keepLifecycle: true });
          return;
        }
      } else {
        logInfo('AgentOrchestrator', 'settlement at flush boundary', { reason, recordingSessionId });
      }
      if (shouldSubmit) {
        const sttReady = await transcribeCapturedAudioIfNeeded(recordingSessionId);
        if (!sttReady) {
          finalizeStop(reason, recordingSessionId, { keepLifecycle: true });
          return;
        }
      }
      logInfo('AgentOrchestrator', 'submit triggered after transcript settlement', {
        reason,
        recordingSessionId,
        sttProvider,
      });
      logInfo('AgentOrchestrator', 'settlement resolved; restart eligible', {
        recordingSessionId,
        pendingSubmitWhenReady: shouldSubmit,
        settlementResolved: settlementResolvedRef.current,
        finalStabilizationActive: finalStabilizationActiveRef.current,
        quietWindowActive: !!quietWindowTimerRef.current,
        audioStopping: audioStateRef.current === 'stopping',
      });
      listenersRef?.current?.onTranscriptReadyForSubmit?.();
      const nextAudioState = shouldSubmit ? 'settling' : 'idleReady';
      setAudioState(nextAudioState, { recordingSessionId, reason: 'settlementResolved' });
      if (Platform.OS === 'ios' && iosStopPendingRef.current && !iosStopInvokedRef.current) {
        logInfo('AgentOrchestrator', 'cleanup forcing native voice stop before idle', {
          recordingSessionId,
        });
        iosStopPendingRef.current = false;
        iosStopInvokedRef.current = true;
        setAudioState('stopping', { recordingSessionId });
        logInfo('AgentOrchestrator', 'native voice stop in flight', { recordingSessionId });
        const V = voiceRef.current;
        if (V) {
          V.stop()
            .catch((e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e);
              const nativeVoice = getVoiceNative();
              if (
                msg.toLowerCase().includes('stopspeech is null') &&
                typeof nativeVoice?.stopSpeech === 'function'
              ) {
                return nativeVoice.stopSpeech();
              }
              return undefined;
            })
            .catch(() => {})
            .finally(() => {
              const next = pendingSubmitWhenReadyRef.current ? 'settling' : 'idleReady';
              setAudioState(next, { recordingSessionId, reason: 'nativeStopComplete' });
              logInfo('AgentOrchestrator', 'native voice stop completed', { recordingSessionId });
            });
        } else {
          const next = pendingSubmitWhenReadyRef.current ? 'settling' : 'idleReady';
          setAudioState(next, { recordingSessionId, reason: 'nativeStopComplete' });
          logInfo('AgentOrchestrator', 'native voice stop completed', { recordingSessionId });
        }
      }
      if (shouldSubmit) {
        finalizeStop(reason, recordingSessionId, { keepLifecycle: true });
      } else {
        finalizeStop(reason, recordingSessionId);
      }
    },
    [
      emitRecoverableFailure,
      finalizeTranscriptFromPartial,
      finalizeStop,
      listenersRef,
      setAudioState,
      sttProvider,
      transcribeCapturedAudioIfNeeded,
      updateTranscript,
    ],
  );

  const stopListening = useCallback(async () => {
    const recordingSessionId = recordingSessionRef.current ?? undefined;
    logInfo('AgentOrchestrator', 'voice listen stop requested', { recordingSessionId });
    stopRequestedRef.current = true;
    setAudioState('stopping', { recordingSessionId, reason: 'stopRequested' });
    if (sttProvider === 'remote') {
      pendingCapturedAudioRef.current = null;
      await sttAudioCapture.cancelCapture(recordingSessionId);
      setAudioState('idleReady', { recordingSessionId, reason: 'remoteCaptureCancelled' });
      nativeRestartGuardUntilRef.current = Date.now() + NATIVE_RESTART_GUARD_MS;
      if (finalizeTimerRef.current) {
        clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
      finalizeStop('stopListening', recordingSessionId);
      return;
    }
    const V = voiceRef.current;
    const invokeStop = async () => {
      iosStopPendingRef.current = false;
      iosStopInvokedRef.current = true;
      logInfo('AgentOrchestrator', 'native voice stop in flight', { recordingSessionId });
      logInfo('AgentOrchestrator', 'voice stop invoked', {
        recordingSessionId,
        platform: Platform.OS,
        pendingSubmitWhenReady: pendingSubmitWhenReadyRef.current,
      });
      if (V) {
        try {
          await V.stop();
          logInfo('AgentOrchestrator', 'native voice stop completed', { recordingSessionId });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const nativeVoice = getVoiceNative();
          if (
            msg.toLowerCase().includes('stopspeech is null') &&
            typeof nativeVoice?.stopSpeech === 'function'
          ) {
            try {
              await nativeVoice.stopSpeech();
              logInfo('AgentOrchestrator', 'native voice stop completed', { recordingSessionId });
            } catch {
              /* ignore */
            }
          }
        }
      } else {
        logInfo('AgentOrchestrator', 'native voice stop completed', { recordingSessionId });
      }
      if (sttProvider === 'remote') {
        pendingCapturedAudioRef.current = null;
        await sttAudioCapture.cancelCapture(recordingSessionId);
      }
      const next = pendingSubmitWhenReadyRef.current ? 'settling' : 'idleReady';
      setAudioState(next, { recordingSessionId, reason: 'nativeStopComplete' });
      nativeRestartGuardUntilRef.current = Date.now() + NATIVE_RESTART_GUARD_MS;
    };
    if (Platform.OS === 'ios') {
      logInfo('AgentOrchestrator', 'ios stop grace scheduled', {
        recordingSessionId,
        graceMs: IOS_STOP_GRACE_MS,
      });
      iosStopPendingRef.current = true;
      if (iosStopGraceTimerRef.current) {
        clearTimeout(iosStopGraceTimerRef.current);
      }
      iosStopGraceTimerRef.current = setTimeout(() => {
        iosStopGraceTimerRef.current = null;
        logInfo('AgentOrchestrator', 'ios stop grace elapsed, calling voice stop', {
          recordingSessionId,
        });
        invokeStop().catch(() => {});
      }, IOS_STOP_GRACE_MS);
    } else {
      logInfo('AgentOrchestrator', 'voice stop invoked immediately (non-ios)', {
        recordingSessionId,
      });
      await invokeStop();
    }
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    finalizeTimerRef.current = setTimeout(() => {
      finalizeTimerRef.current = null;
      finalizeStop('stopListening', recordingSessionId);
    }, 300);
  }, [finalizeStop, setAudioState, sttAudioCapture, sttProvider]);

  const stopListeningAndRequestSubmit = useCallback(async () => {
    const recordingSessionId = recordingSessionRef.current ?? undefined;
    logInfo('AgentOrchestrator', 'voice listen stop requested', { recordingSessionId });
    logInfo('AgentOrchestrator', 'transcript finalization started', { recordingSessionId });
    stopRequestedRef.current = true;
    setAudioState('stopping', { recordingSessionId, reason: 'stopForSubmit' });
    if (sttProvider === 'remote') {
      pendingCapturedAudioRef.current = await sttAudioCapture.endCapture(recordingSessionId);
      setAudioState('settling', { recordingSessionId, reason: 'remoteCaptureComplete' });
      const sttReady = await transcribeCapturedAudioIfNeeded(recordingSessionId);
      if (!sttReady) {
        finalizeStop('remoteSttFailed', recordingSessionId, { keepLifecycle: true });
        return;
      }
      logInfo('AgentOrchestrator', 'submit triggered after remote stt capture', {
        recordingSessionId,
        sttProvider,
      });
      listenersRef?.current?.onTranscriptReadyForSubmit?.();
      setAudioState('settling', { recordingSessionId, reason: 'remoteTranscriptReady' });
      finalizeStop('remoteSttSubmitReady', recordingSessionId, { keepLifecycle: true });
      return;
    }
    pendingSubmitWhenReadyRef.current = true;
    pendingSubmitSessionIdRef.current = recordingSessionRef.current;
    settlementResolvedRef.current = false;
    finalCandidateTextRef.current = null;
    finalCandidateSessionIdRef.current = null;
    finalStabilizationActiveRef.current = false;
    flushBoundaryAnchorAtRef.current = Date.now();
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    if (finalStabilizationTimerRef.current) {
      clearTimeout(finalStabilizationTimerRef.current);
      finalStabilizationTimerRef.current = null;
    }
    const V = voiceRef.current;
    const invokeStop = async () => {
      iosStopPendingRef.current = false;
      iosStopInvokedRef.current = true;
      logInfo('AgentOrchestrator', 'native voice stop in flight', { recordingSessionId });
      logInfo('AgentOrchestrator', 'voice stop invoked', {
        recordingSessionId,
        platform: Platform.OS,
        pendingSubmitWhenReady: pendingSubmitWhenReadyRef.current,
      });
      if (V) {
        try {
          await V.stop();
          logInfo('AgentOrchestrator', 'native voice stop completed', { recordingSessionId });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const nativeVoice = getVoiceNative();
          if (
            msg.toLowerCase().includes('stopspeech is null') &&
            typeof nativeVoice?.stopSpeech === 'function'
          ) {
            try {
              await nativeVoice.stopSpeech();
              logInfo('AgentOrchestrator', 'native voice stop completed', { recordingSessionId });
            } catch {
              /* ignore */
            }
          }
        }
      } else {
        logInfo('AgentOrchestrator', 'native voice stop completed', { recordingSessionId });
      }
      if (sttProvider === 'remote') {
        pendingCapturedAudioRef.current = await sttAudioCapture.endCapture(recordingSessionId);
      }
      setAudioState('settling', { recordingSessionId, reason: 'nativeStopComplete' });
      nativeRestartGuardUntilRef.current = Date.now() + NATIVE_RESTART_GUARD_MS;
    };
    if (Platform.OS === 'ios') {
      logInfo('AgentOrchestrator', 'ios stop grace scheduled', {
        recordingSessionId,
        graceMs: IOS_STOP_GRACE_MS,
      });
      iosStopPendingRef.current = true;
      if (iosStopGraceTimerRef.current) {
        clearTimeout(iosStopGraceTimerRef.current);
      }
      iosStopGraceTimerRef.current = setTimeout(() => {
        iosStopGraceTimerRef.current = null;
        logInfo('AgentOrchestrator', 'ios stop grace elapsed, calling voice stop', {
          recordingSessionId,
        });
        invokeStop().catch(() => {});
      }, IOS_STOP_GRACE_MS);
    } else {
      logInfo('AgentOrchestrator', 'voice stop invoked immediately (non-ios)', {
        recordingSessionId,
      });
      await invokeStop();
    }
    finalizeTimerRef.current = setTimeout(() => {
      finalizeTimerRef.current = null;
      if (!settlementResolvedRef.current && pendingSubmitWhenReadyRef.current) {
        const sessionId = pendingSubmitSessionIdRef.current ?? undefined;
        void resolveSettlement('flushWindowExpired', sessionId);
      }
    }, POST_STOP_FLUSH_WINDOW_MS);
  }, [resolveSettlement, setAudioState, sttAudioCapture, sttProvider]);

  const startListening = useCallback(
    async (fresh = false): Promise<{ ok: boolean; reason?: string }> => {
      const V = voiceRef.current;
      if (!V && sttProvider !== 'remote') {
        logWarn('AgentOrchestrator', 'start attempt rejected: voice module unavailable');
        return { ok: false, reason: 'voiceUnavailable' };
      }
      if (audioStateRef.current === 'starting') {
        logWarn('AgentOrchestrator', 'start attempt rejected: audio starting');
        applyIoBlock('audioStarting');
        return { ok: false, reason: 'audioStarting' };
      }
      if (audioStateRef.current === 'stopping') {
        logWarn('AgentOrchestrator', 'start attempt rejected: audio stopping');
        applyIoBlock('audioStopping');
        return { ok: false, reason: 'audioStopping' };
      }
      if (audioStateRef.current === 'settling') {
        logWarn('AgentOrchestrator', 'start attempt rejected: audio settling');
        applyIoBlock('audioSettling');
        return { ok: false, reason: 'audioSettling' };
      }
      if (iosStopPendingRef.current) {
        logWarn('AgentOrchestrator', 'start attempt rejected: ios stop pending');
        applyIoBlock('iosStopPending');
        return { ok: false, reason: 'iosStopPending' };
      }
      if (audioStateRef.current !== 'idleReady') {
        logWarn('AgentOrchestrator', 'start attempt rejected: audio not ready', {
          state: audioStateRef.current,
        });
        applyIoBlock('audioNotReady');
        return { ok: false, reason: 'audioNotReady' };
      }
      if (Date.now() < nativeRestartGuardUntilRef.current) {
        logWarn('AgentOrchestrator', 'start attempt rejected: native restart guard active', {
          guardUntil: nativeRestartGuardUntilRef.current,
        });
        applyIoBlock('nativeGuard');
        return { ok: false, reason: 'nativeGuard' };
      }
      if (pendingSubmitWhenReadyRef.current && !settlementResolvedRef.current) {
        logWarn('AgentOrchestrator', 'start attempt rejected: pending settlement still open', {
          recordingSessionId: pendingSubmitSessionIdRef.current ?? undefined,
          pendingSubmitWhenReady: pendingSubmitWhenReadyRef.current,
          settlementResolved: settlementResolvedRef.current,
          finalStabilizationActive: finalStabilizationActiveRef.current,
          quietWindowActive: !!quietWindowTimerRef.current,
          audioState: audioStateRef.current,
        });
        return { ok: false, reason: 'pendingSettlement' };
      }
      if (mode === 'processing' || mode === 'speaking') {
        logWarn('AgentOrchestrator', 'start attempt rejected: lifecycle blocked', { mode });
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
      if (quietWindowTimerRef.current) {
        clearTimeout(quietWindowTimerRef.current);
        quietWindowTimerRef.current = null;
      }
      if (finalStabilizationTimerRef.current) {
        clearTimeout(finalStabilizationTimerRef.current);
        finalStabilizationTimerRef.current = null;
      }
      flushBoundaryAnchorAtRef.current = null;
      finalCandidateTextRef.current = null;
      finalCandidateSessionIdRef.current = null;
      finalStabilizationActiveRef.current = false;
      pendingCapturedAudioRef.current = null;
      recordingSessionSeqRef.current += 1;
      const recordingSessionId = `rec-${recordingSessionSeqRef.current}`;
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
            const message = 'OpenAI proxy base URL not configured (ENDPOINT_BASE_URL)';
            setAudioState('idleReady', { recordingSessionId });
            setError(message);
            logError('AgentOrchestrator', 'remote stt start blocked: base URL missing', {
              recordingSessionId,
              sttProvider,
            });
            return { ok: false, reason: 'sttBaseUrlMissing' };
          }
          const captureStarted = await sttAudioCapture.beginCapture(recordingSessionId);
          if (!captureStarted) {
            const message = 'Remote STT audio capture unavailable';
            setAudioState('idleReady', { recordingSessionId });
            setError(message);
            logError('AgentOrchestrator', 'remote stt start blocked: audio capture unavailable', {
              recordingSessionId,
              sttProvider,
              endpointBaseUrl,
            });
            return { ok: false, reason: 'sttCaptureUnavailable' };
          }
          setAudioState('listening', { recordingSessionId });
          clearIoBlock();
          recordingSessionRef.current = recordingSessionId;
          lastSettledSessionIdRef.current = null;
          speechEndedRef.current = false;
          logInfo('AgentOrchestrator', 'voice listen active', {
            recordingSessionId,
            startLatencyMs:
              recordingStartAtRef.current != null ? Date.now() - recordingStartAtRef.current : undefined,
          });
          logInfo('AgentOrchestrator', 'start attempt accepted', { recordingSessionId });
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
        lastSettledSessionIdRef.current = null;
        speechEndedRef.current = false;
        logInfo('AgentOrchestrator', 'voice listen active', {
          recordingSessionId,
          startLatencyMs:
            recordingStartAtRef.current != null ? Date.now() - recordingStartAtRef.current : undefined,
        });
        logInfo('AgentOrchestrator', 'start attempt accepted', { recordingSessionId });
        playListenIn();
        return { ok: true };
      } catch (e) {
        if (sttProvider === 'remote') {
          pendingCapturedAudioRef.current = null;
          await sttAudioCapture.cancelCapture(recordingSessionId);
        }
        setAudioState('idleReady', { recordingSessionId });
        const message = e instanceof Error ? e.message : 'Failed to start voice';
        if (isRecognizerReentrancyError(message)) {
          logWarn('AgentOrchestrator', 'voice listen start blocked by native reentrancy', {
            recordingSessionId,
            message,
          });
          nativeRestartGuardUntilRef.current = Date.now() + NATIVE_RESTART_GUARD_MS;
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
      sttAudioCapture,
      sttProvider,
      updateTranscript,
    ],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' && modeRef.current === 'listening') {
        stopListening();
      }
    });
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
      logWarn('AgentOrchestrator', 'submit blocked because active request exists');
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
    previousCommittedResponseRef.current = responseTextRef.current;
    previousCommittedValidationRef.current = validationSummaryRef.current;
    activeRequestIdRef.current = reqId;
    firstChunkSentRef.current = false;
    lastPartialEmitAtRef.current = 0;
    requestInFlightRef.current = true;
    logInfo('AgentOrchestrator', 'active requestId set', { requestId: reqId });
    setError(null);
    setResponseText(null);
    setValidationSummary(null);
    setMode('processing');
    {
      const prev = prevLifecycleRef.current;
      if (prev !== 'processing') {
        logLifecycle('AgentOrchestrator', `lifecycle transition ${prev} -> processing`, {
          requestId: reqId,
        });
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
    requestDebugSinkRef?.current?.({
      type: 'processing_substate',
      requestId: reqId,
      processingSubstate: 'retrieving',
      timestamp: Date.now(),
    });
    const requestStartedAt = Date.now();
    requestDebugSinkRef?.current?.({
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
    requestDebugSinkRef?.current?.({
      type: 'retrieval_start',
      requestId: reqId,
      retrievalStartedAt,
      timestamp: retrievalStartedAt,
    });
    logInfo('AgentOrchestrator', 'retrieval started', { requestId: reqId });
    listenersRef?.current?.onRetrievalStart?.();
    try {
      if (!getPackState()) {
        let packRoot: string;
        try {
          packRoot = await copyBundlePackToDocuments();
        } catch (e) {
          logInfo('Runtime', 'Copy pack to Documents failed, using bundle', { message: e instanceof Error ? e.message : String(e) });
          packRoot = (await getContentPackPathInDocuments()) ?? '';
        }
        logInfo('Runtime', 'pack path resolved', {
          packRoot,
          hasPackRoot: !!packRoot,
          usingDocumentsReader: !!packRoot,
        });
        const reader =
          (packRoot ? createDocumentsPackReader(packRoot) : null) ??
          createBundlePackReader() ??
          createThrowReader(
            'Pack not configured. Add the content pack to assets/content_pack and rebuild the app.',
          );
        const embedModelId = await getPackEmbedModelId(reader);
        const { embedModelPath, chatModelPath } = await getOnDeviceModelPaths(
          packRoot || undefined,
        );
        await ragInit(
          { embedModelId, embedModelPath, chatModelPath, packRoot: packRoot || '' },
          reader,
          { requestDebugSink: requestDebugSinkRef?.current ?? undefined },
        );
      }
      const retrievalEndedAt = Date.now();
      requestDebugSinkRef?.current?.({
        type: 'retrieval_end',
        requestId: reqId,
        retrievalEndedAt,
        packIdentity: null,
        timestamp: retrievalEndedAt,
      });
      logInfo('AgentOrchestrator', 'retrieval completed', { requestId: reqId });
      listenersRef?.current?.onRetrievalEnd?.();
      const generationStartedAt = Date.now();
      requestDebugSinkRef?.current?.({
        type: 'generation_start',
        requestId: reqId,
        generationStartedAt,
        timestamp: generationStartedAt,
      });
      logInfo('AgentOrchestrator', 'generation started', { requestId: reqId });
      listenersRef?.current?.onGenerationStart?.();
      const result = await ragAsk(question, {
        requestId: reqId,
        requestDebugSink: requestDebugSinkRef?.current ?? undefined,
        onRetrievalComplete: () => {
          if (activeRequestIdRef.current !== reqId) return;
          setProcessingSubstate('preparingContext');
          requestDebugSinkRef?.current?.({
            type: 'processing_substate',
            requestId: reqId,
            processingSubstate: 'preparingContext',
            timestamp: Date.now(),
          });
        },
        onModelLoadStart: () => {
          if (activeRequestIdRef.current !== reqId) return;
          setProcessingSubstate('loadingModel');
          requestDebugSinkRef?.current?.({
            type: 'processing_substate',
            requestId: reqId,
            processingSubstate: 'loadingModel',
            timestamp: Date.now(),
          });
        },
        onGenerationStart: () => {
          if (activeRequestIdRef.current !== reqId) return;
          setProcessingSubstate('awaitingFirstToken');
          requestDebugSinkRef?.current?.({
            type: 'processing_substate',
            requestId: reqId,
            processingSubstate: 'awaitingFirstToken',
            timestamp: Date.now(),
          });
        },
        onValidationStart: () => {
          if (activeRequestIdRef.current !== reqId) return;
          const validationStartedAt = Date.now();
          setProcessingSubstate('validating');
          requestDebugSinkRef?.current?.({
            type: 'validation_start',
            requestId: reqId,
            validationStartedAt,
            timestamp: validationStartedAt,
          });
          logInfo('AgentOrchestrator', 'validation_start', {
            requestId: reqId,
            lifecycle: 'processing',
            processingSubstate: 'validating',
          });
          requestDebugSinkRef?.current?.({
            type: 'processing_substate',
            requestId: reqId,
            processingSubstate: 'validating',
            lifecycle: 'processing',
            timestamp: validationStartedAt,
          });
        },
        onPartial: (accumulatedText: string) => {
          if (activeRequestIdRef.current !== reqId) return;
          const now = Date.now();
          const isFirstChunk =
            !firstChunkSentRef.current &&
            accumulatedText.length > 0;
          if (isFirstChunk) {
            firstChunkSentRef.current = true;
            lastResponseTextUpdateAtRef.current = now;
            setResponseText(accumulatedText);
            setProcessingSubstate('streaming');
            requestDebugSinkRef?.current?.({
              type: 'processing_substate',
              requestId: reqId,
              processingSubstate: 'streaming',
              timestamp: now,
            });
            const firstTokenAt = now;
            requestDebugSinkRef?.current?.({
              type: 'first_token',
              requestId: reqId,
              firstTokenAt,
              timestamp: firstTokenAt,
            });
            logInfo('AgentOrchestrator', 'first token received', { requestId: reqId });
            logInfo('ResponseSurface', 'response_surface_streaming_started', {
              requestId: reqId,
              lifecycle: 'processing',
              processingSubstate: 'streaming',
              partialChars: accumulatedText.length,
            });
            listenersRef?.current?.onFirstToken?.();
          } else {
            if (now - lastResponseTextUpdateAtRef.current >= RESPONSE_TEXT_UPDATE_THROTTLE_MS) {
              lastResponseTextUpdateAtRef.current = now;
              setResponseText(accumulatedText);
            }
          }
          if (now - lastPartialEmitAtRef.current >= PARTIAL_EMIT_THROTTLE_MS) {
            lastPartialEmitAtRef.current = now;
            requestDebugSinkRef?.current?.({
              type: 'partial_output',
              requestId: reqId,
              accumulatedText,
              timestamp: now,
            });
          }
        },
      });
      if (reqId !== activeRequestIdRef.current) {
        previousCommittedResponseRef.current = null;
        previousCommittedValidationRef.current = null;
        logWarn('AgentOrchestrator', 'stale completion ignored (non-active request)', {
          requestId: reqId,
          activeRequestId: activeRequestIdRef.current,
        });
        return null;
      }
      const nudgedRaw = result.nudged;
      const committedText =
        nudgedRaw.trim().length > 0 ? nudgedRaw : EMPTY_RESPONSE_FALLBACK_MESSAGE;
      const isEmptyOutput = nudgedRaw.trim().length === 0;
      if (isEmptyOutput) {
        logInfo('ResponseSurface', 'response_surface_empty_output', {
          requestId: reqId,
          lifecycle: 'processing',
          disposition: 'empty',
        });
      }
      setResponseText(committedText);
      setValidationSummary(result.validationSummary);
      if (!firstChunkSentRef.current) {
        logInfo('AgentOrchestrator', 'first token received', { requestId: reqId });
        listenersRef?.current?.onFirstToken?.();
      }
      const generationEndedAt = Date.now();
      requestDebugSinkRef?.current?.({
        type: 'partial_output',
        requestId: reqId,
        accumulatedText: committedText,
        timestamp: generationEndedAt,
      });
      requestDebugSinkRef?.current?.({
        type: 'generation_end',
        requestId: reqId,
        generationEndedAt,
        finalSettledOutput: committedText,
        validationSummary: result.validationSummary,
        timestamp: generationEndedAt,
      });
      logInfo('AgentOrchestrator', 'generation completed', { requestId: reqId });
      logInfo('AgentOrchestrator', 'result payload ready', {
        requestId: reqId,
        responseChars: committedText.length,
        rulesCount: result.validationSummary.rules.length,
        cardsCount: result.validationSummary.cards.length,
      });
      listenersRef?.current?.onGenerationEnd?.();
      listenersRef?.current?.onComplete?.();
      requestInFlightRef.current = false;
      const validationEndedAt = Date.now();
      const settlingStartedAt = validationEndedAt;
      setProcessingSubstate('settling');
      requestDebugSinkRef?.current?.({
        type: 'validation_end',
        requestId: reqId,
        validationEndedAt,
        timestamp: validationEndedAt,
      });
      logInfo('AgentOrchestrator', 'validation_end', {
        requestId: reqId,
        lifecycle: 'processing',
        processingSubstate: 'settling',
      });
      requestDebugSinkRef?.current?.({
        type: 'settling_start',
        requestId: reqId,
        settlingStartedAt,
        timestamp: settlingStartedAt,
      });
      logInfo('AgentOrchestrator', 'settling_start', {
        requestId: reqId,
        lifecycle: 'processing',
        processingSubstate: 'settling',
      });
      requestDebugSinkRef?.current?.({
        type: 'processing_substate',
        requestId: reqId,
        processingSubstate: 'settling',
        lifecycle: 'processing',
        timestamp: settlingStartedAt,
      });
      const settledAt = Date.now();
      requestDebugSinkRef?.current?.({
        type: 'response_settled',
        requestId: reqId,
        lifecycle: 'processing',
        processingSubstate: 'settling',
        committedChars: committedText.length,
        rulesCount: result.validationSummary.rules.length,
        cardsCount: result.validationSummary.cards.length,
        finalSettledOutput: committedText,
        validationSummary: result.validationSummary,
        timestamp: settledAt,
      });
      logInfo('ResponseSurface', 'response_settled', {
        requestId: reqId,
        lifecycle: 'processing',
        processingSubstate: 'settling',
        committedChars: committedText.length,
        rulesCount: result.validationSummary.rules.length,
        cardsCount: result.validationSummary.cards.length,
      });
      logInfo('ResponseSurface', 'response_settled_payload', {
        requestId: reqId,
        committedResponseText: committedText,
        ...summarizeValidationSummary(result.validationSummary),
      });
      setError(null);
      setProcessingSubstate(null);
      requestDebugSinkRef?.current?.({
        type: 'processing_substate',
        requestId: reqId,
        processingSubstate: null,
        timestamp: Date.now(),
      });
      setMode('idle');
      setLifecycle('idle');
      previousCommittedResponseRef.current = null;
      previousCommittedValidationRef.current = null;
      if (committedText.length > 0 && !isEmptyOutput) {
        playbackRequestIdRef.current = reqId;
        logInfo('ResponseSurface', 'response_surface_playback_bound_to_committed_response', {
          requestId: reqId,
          speakingBoundToCommittedResponse: true,
          committedChars: committedText.length,
        });
        playTextRef.current?.(committedText).catch(() => {});
      } else {
        const completedAt = Date.now();
        requestDebugSinkRef?.current?.({
          type: 'request_complete',
          requestId: reqId,
          status: 'completed',
          completedAt,
          lifecycle: 'idle',
          timestamp: completedAt,
        });
        activeRequestIdRef.current = 0;
        setAudioState('idleReady', { reason: 'requestComplete' });
        logInfo('AgentOrchestrator', 'active requestId cleared', { requestId: reqId });
      }
      return committedText;
    } catch (e) {
      // Fallback policy: reserved. Non-triggers: empty/weak transcript, recoverable denials, slow gen, weak retrieval, quality heuristics. If implemented, only from explicit triggers (e.g. E_MODEL_PATH or user/debug).
      const msg = errorMessage(e);
      const code =
        e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
      const failureClassification = classifyTerminalFailure(e);
      const failureReasonLabel = failureClassification.telemetryReason;
      let displayMsg = code ? `[${code}] ${msg}` : msg;
      if (code === 'E_MODEL_PATH' && Platform.OS === 'android') {
        displayMsg += ` Put the chat GGUF in the app's files/models/ folder (filename: ${CHAT_MODEL_FILENAME}).`;
      }
      if (reqId === activeRequestIdRef.current) {
        requestInFlightRef.current = false;
        const failedAt = Date.now();
        requestDebugSinkRef?.current?.({
          type: 'request_failed',
          requestId: reqId,
          failureReason: failureReasonLabel,
          status: 'failed',
          completedAt: failedAt,
          lifecycle: 'error',
          timestamp: failedAt,
        });
        activeRequestIdRef.current = 0;
        logInfo('AgentOrchestrator', 'active requestId cleared', { requestId: reqId });
        setResponseText(previousCommittedResponseRef.current);
        setValidationSummary(previousCommittedValidationRef.current);
        previousCommittedResponseRef.current = null;
        previousCommittedValidationRef.current = null;
        setProcessingSubstate(null);
        requestDebugSinkRef?.current?.({
          type: 'processing_substate',
          requestId: reqId,
          processingSubstate: null,
          timestamp: Date.now(),
        });
        setMode('idle');
        setLifecycle('idle');
        setAudioState('idleReady', { reason: 'requestFailed' });
        listenersRef?.current?.onError?.(failureClassification.kind, {
          stage: failureClassification.stage,
          recoverability: failureClassification.recoverability,
          transientEvent: failureClassification.transientEvent,
          telemetryReason: failureClassification.telemetryReason,
        });
        const requestFailurePayload = {
          requestId: reqId,
          message: displayMsg,
          failureKind: failureClassification.kind,
          failureStage: failureClassification.stage,
          failureReason: failureReasonLabel,
        };
        if (failureClassification.kind === 'retrieval_empty_bundle') {
          logWarn(
            'AgentOrchestrator',
            'request failed (terminal request failure; returning to idle)',
            requestFailurePayload,
          );
        } else {
          logError(
            'AgentOrchestrator',
            'request failed (terminal request failure; returning to idle)',
            requestFailurePayload,
          );
        }
        return null;
      }
      previousCommittedResponseRef.current = null;
      previousCommittedValidationRef.current = null;
      logWarn('AgentOrchestrator', 'stale completion ignored (non-active request)', {
        requestId: reqId,
        activeRequestId: activeRequestIdRef.current,
        message: displayMsg,
      });
      return null;
    }
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
        logInfo('Playback', 'tts path selected', { provider: 'piper', textChars: normalized.length });
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
        requestDebugSinkRef?.current?.({
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
            const message = e instanceof Error ? e.message : 'Piper playback failed';
            setError(message);
            logError('Playback', 'piper playback failed', { message, textChars: normalized.length });
          }
        } finally {
          const ttsEndedAt = Date.now();
          const reqIdForLog = playbackRequestIdRef.current;
          requestDebugSinkRef?.current?.({
            type: 'tts_end',
            requestId: reqIdForLog,
            ttsEndedAt,
            timestamp: ttsEndedAt,
            lifecycle: 'idle',
          });
          if (reqIdForLog != null) {
            pendingPlaybackCompleteRef.current = { requestId: reqIdForLog, endedAt: ttsEndedAt };
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
        logInfo('Playback', 'tts path selected', { provider: 'react-native-tts', textChars: normalized.length });
        const reqIdForTts = playbackRequestIdRef.current;
        const onFinish = () => {
          const ttsEndedAt = Date.now();
          requestDebugSinkRef?.current?.({
            type: 'tts_end',
            requestId: reqIdForTts,
            ttsEndedAt,
            timestamp: ttsEndedAt,
            lifecycle: 'idle',
          });
          if (reqIdForTts != null) {
            pendingPlaybackCompleteRef.current = { requestId: reqIdForTts, endedAt: ttsEndedAt };
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
        requestDebugSinkRef?.current?.({
          type: 'tts_start',
          requestId: reqIdForTts,
          ttsStartedAt,
          timestamp: ttsStartedAt,
          lifecycle: 'speaking',
        });
        logInfo('AgentOrchestrator', 'playback started', { provider: 'react-native-tts' });
        listenersRef?.current?.onPlaybackStart?.();
        Tts.speak(normalized);
      } catch (e) {
        if (!playbackInterruptedRef.current) {
          const message = e instanceof Error ? e.message : 'TTS playback failed';
          setError(message);
          setProcessingSubstate(null);
          setMode('idle');
          setLifecycle('error');
          logError('Playback', 'tts playback failed', { message, textChars: normalized.length });
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
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    if (quietWindowTimerRef.current) {
      clearTimeout(quietWindowTimerRef.current);
      quietWindowTimerRef.current = null;
    }
    flushBoundaryAnchorAtRef.current = null;
    pendingSubmitWhenReadyRef.current = false;
    pendingSubmitSessionIdRef.current = null;
    settlementResolvedRef.current = true;
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
  }, [stopListening]);

  // Lazy-load Voice
  useEffect(() => {
    try {
      const VoiceNative = getVoiceNative();
      if (!VoiceNative) {
        setError('Speech recognition not available (native Voice module not linked).');
        setVoiceReady(true);
        voiceRef.current = null;
        return;
      }
      if (typeof (VoiceNative as { addListener?: unknown }).addListener !== 'function') {
        (VoiceNative as { addListener: () => void }).addListener = () => {};
      }
      if (typeof (VoiceNative as { removeListeners?: unknown }).removeListeners !== 'function') {
        (VoiceNative as { removeListeners: (_: number) => void }).removeListeners = () => {};
      }
      const Voice = require('@react-native-voice/voice').default as VoiceModule;
      const hasStartApi =
        typeof Voice?.start === 'function' ||
        typeof VoiceNative?.startSpeech === 'function';
      const hasStopApi =
        typeof Voice?.stop === 'function' ||
        typeof VoiceNative?.stopSpeech === 'function';
      if (!hasStartApi || !hasStopApi) {
        setError('Speech recognition not available (Voice start/stop API missing).');
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
    return () => {
    };
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
      logLifecycle('AgentOrchestrator', `lifecycle transition ${prev} -> ${lifecycle}`, details);
      prevLifecycleRef.current = lifecycle;
    }
  }, [lifecycle]);

  useEffect(() => {
    if (lifecycle !== 'idle') return;
    const pending = pendingPlaybackCompleteRef.current;
    if (!pending) return;
    pendingPlaybackCompleteRef.current = null;
    requestDebugSinkRef?.current?.({
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
    logInfo('AgentOrchestrator', 'active requestId cleared', { requestId: pending.requestId });
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
      if (settlementResolvedRef.current) {
        logWarn('AgentOrchestrator', 'late final ignored for settled session', { recordingSessionId: sessionId });
        return;
      }
      if (sessionId && sessionId === lastSettledSessionIdRef.current) {
        logWarn('AgentOrchestrator', 'late final ignored for settled session', { recordingSessionId: sessionId });
        return;
      }
      if (!sessionId && !stopRequestedRef.current) {
        logWarn('AgentOrchestrator', 'late final ignored for inactive session', {});
        return;
      }
      if (modeRef.current !== 'listening' && !stopRequestedRef.current) return;
      const next = (e.value?.[0] ?? '').trim();
      if (speechEndedRef.current) {
        const normalizedIncoming = normalizeTranscript(next);
        logInfo('AgentOrchestrator', 'final ignored because speechEndedRef=true', {
          recordingSessionId: sessionId,
          pendingSubmitWhenReady: pendingSubmitWhenReadyRef.current,
          settlementResolved: settlementResolvedRef.current,
          finalStabilizationActive: finalStabilizationActiveRef.current,
          incomingChunkChars: normalizedIncoming.length,
          incomingTranscriptText: normalizedIncoming,
          incomingTranscriptPreview: transcriptPreview(normalizedIncoming),
        });
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
        pendingSubmitWhenReadyRef.current &&
        recordingSessionRef.current === pendingSubmitSessionIdRef.current &&
        !settlementResolvedRef.current
      ) {
        const currentCandidate = finalCandidateTextRef.current ?? '';
        const shouldReplaceCandidate = normalizedCombined.length >= currentCandidate.length;
        logInfo('AgentOrchestrator', 'final candidate evaluation', {
          recordingSessionId: sessionId,
          currentCandidateChars: currentCandidate.length,
          currentCandidateText: currentCandidate,
          currentCandidatePreview: transcriptPreview(currentCandidate),
          incomingCandidateChars: normalizedCombined.length,
          incomingCandidateText: normalizedCombined,
          incomingCandidatePreview: transcriptPreview(normalizedCombined),
          accepted: shouldReplaceCandidate,
        });
        if (shouldReplaceCandidate) {
          finalCandidateTextRef.current = normalizedCombined;
          finalCandidateSessionIdRef.current = sessionId ?? null;
        }
        finalStabilizationActiveRef.current = true;
        if (quietWindowTimerRef.current) {
          clearTimeout(quietWindowTimerRef.current);
          quietWindowTimerRef.current = null;
        }
        if (!finalStabilizationTimerRef.current) {
          finalStabilizationTimerRef.current = setTimeout(() => {
            finalStabilizationTimerRef.current = null;
            finalStabilizationActiveRef.current = false;
            if (settlementResolvedRef.current) return;
          }, POST_FINAL_STABILIZATION_WINDOW_MS);
        }
      }
    };
    V.onSpeechPartialResults = e => {
      const sessionId = recordingSessionRef.current ?? undefined;
      if (settlementResolvedRef.current) {
        logWarn('AgentOrchestrator', 'late partial ignored for settled session', { recordingSessionId: sessionId });
        return;
      }
      if (sessionId && sessionId === lastSettledSessionIdRef.current) {
        logWarn('AgentOrchestrator', 'late partial ignored for settled session', { recordingSessionId: sessionId });
        return;
      }
      if (!sessionId && !stopRequestedRef.current) {
        logWarn('AgentOrchestrator', 'late partial ignored for inactive session', {});
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
      if (settlementResolvedRef.current || (sessionId && sessionId === lastSettledSessionIdRef.current)) {
        logWarn('AgentOrchestrator', 'late speechError downgraded for settled session', {
          recordingSessionId: sessionId,
          message: e.error?.message ?? 'Speech recognition error',
        });
        return;
      }
      if (!sessionId && !stopRequestedRef.current) {
        logWarn('AgentOrchestrator', 'late speechError downgraded for inactive session', {
          message: e.error?.message ?? 'Speech recognition error',
        });
        return;
      }
      if (stopRequestedRef.current || modeRef.current !== 'listening') {
        logWarn('AgentOrchestrator', 'post-stop speech error downgraded to non-fatal', {
          recordingSessionId: sessionId,
          message: e.error?.message ?? 'Speech recognition error',
        });
        return;
      }
      const message = e.error?.message ?? 'Speech recognition error';
      if (isRecoverableSpeechError(message)) {
        logWarn('AgentOrchestrator', 'speech recognition error downgraded (recoverable)', {
          recordingSessionId: sessionId,
          message,
        });
        emitRecoverableFailure('speechErrorRecoverable', {
          recordingSessionId: sessionId,
          message,
        });
        stopListeningAndRequestSubmit().catch(() => {});
        return;
      }
      if (
        isRecognizerReentrancyError(message) &&
        (audioStateRef.current !== 'listening' ||
          iosStopPendingRef.current ||
          modeRef.current !== 'listening')
      ) {
        logWarn('AgentOrchestrator', 'speech recognition error downgraded (native reentrancy)', {
          recordingSessionId: sessionId,
          message,
          audioState: audioStateRef.current,
          iosStopPending: iosStopPendingRef.current,
          mode: modeRef.current,
        });
        nativeRestartGuardUntilRef.current = Date.now() + NATIVE_RESTART_GUARD_MS;
        setAudioState(audioStateRef.current === 'stopping' ? 'stopping' : 'settling', {
          recordingSessionId: sessionId,
          reason: 'nativeReentrancy',
        });
        return;
      }
      setError(message);
      playError();
      if (finalizeTimerRef.current) {
        clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
      stopRequestedRef.current = false;
      setProcessingSubstate(null);
      setMode('idle');
      setLifecycle('error');
      logError('AgentOrchestrator', 'speech recognition error (fatal: transcript acquisition failed)', {
        recordingSessionId: recordingSessionRef.current ?? undefined,
        message,
      });
      setAudioState('settling', { recordingSessionId: sessionId, reason: 'speechErrorFatal' });
      nativeRestartGuardUntilRef.current = Date.now() + NATIVE_RESTART_GUARD_MS;
      recordingSessionRef.current = null;
      speechEndedRef.current = false;
    };
    V.onSpeechEnd = () => {
      const recordingSessionId = recordingSessionRef.current ?? undefined;
      if (settlementResolvedRef.current) {
        logWarn('AgentOrchestrator', 'late speechEnd ignored for settled session', { recordingSessionId });
        return;
      }
      if (recordingSessionId && recordingSessionId === lastSettledSessionIdRef.current) {
        logWarn('AgentOrchestrator', 'late speechEnd ignored for settled session', { recordingSessionId });
        return;
      }
      if (!recordingSessionId && !stopRequestedRef.current) {
        logWarn('AgentOrchestrator', 'late speechEnd ignored for inactive session', {});
        return;
      }
      if (speechEndedRef.current) return;
      logInfo('AgentOrchestrator', 'speech recognition end event', {
        recordingSessionId,
        tMs:
          recordingStartAtRef.current != null ? Date.now() - recordingStartAtRef.current : undefined,
      });
      speechEndedRef.current = true;
      if (audioStateRef.current !== 'stopping') {
        const next = pendingSubmitWhenReadyRef.current ? 'settling' : 'idleReady';
        setAudioState(next, { recordingSessionId, reason: 'speechEnd' });
        nativeRestartGuardUntilRef.current = Date.now() + NATIVE_RESTART_GUARD_MS;
      }
      if (
        pendingSubmitWhenReadyRef.current &&
        recordingSessionRef.current === pendingSubmitSessionIdRef.current &&
        !settlementResolvedRef.current
      ) {
        const sessionIdForQuiet = recordingSessionId ?? undefined;
        logInfo('AgentOrchestrator', 'speechEnd received, quiet window started', { recordingSessionId: sessionIdForQuiet });
        if (quietWindowTimerRef.current) {
          clearTimeout(quietWindowTimerRef.current);
          quietWindowTimerRef.current = null;
        }
        if (finalStabilizationTimerRef.current) {
          clearTimeout(finalStabilizationTimerRef.current);
          finalStabilizationTimerRef.current = null;
        }
        quietWindowTimerRef.current = setTimeout(() => {
          quietWindowTimerRef.current = null;
          if (settlementResolvedRef.current) return;
          if (recordingSessionRef.current !== pendingSubmitSessionIdRef.current) return;
          const currentTranscript = normalizeTranscript(transcribedTextRef.current);
          const finalCandidate = finalCandidateTextRef.current ?? '';
          const partialCandidate = transcriptTrace(partialTranscriptRef.current);
          logInfo('AgentOrchestrator', 'quiet window settling current transcript', {
            recordingSessionId: sessionIdForQuiet,
            currentTranscriptChars: currentTranscript.length,
            currentTranscriptText: currentTranscript,
            currentTranscriptPreview: transcriptPreview(currentTranscript),
            finalCandidateChars: finalCandidate.length,
            finalCandidateTranscriptText: finalCandidate,
            finalCandidateTranscriptPreview: transcriptPreview(finalCandidate),
            partialCandidateChars: partialCandidate.chars,
            partialCandidateText: partialCandidate.text,
            partialCandidatePreview: partialCandidate.preview,
          });
          void resolveSettlement('quietWindowExpired', sessionIdForQuiet);
        }, POST_SPEECH_END_QUIET_WINDOW_MS);
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
    emitRecoverableFailure,
    playListenIn,
    playListenOut,
    playError,
    listenersRef,
    updateTranscript,
    finalizeTranscriptFromPartial,
    finalizeStop,
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
        .then((path: string) => path && logInfo('Playback', 'Piper model copied to', { path }))
        .catch((e: unknown) =>
          logWarn('Playback', 'Piper copyModelToFiles failed', { message: e instanceof Error ? e.message : String(e) }),
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
    processingSubstate: emittedLifecycle === 'processing' ? processingSubstate : null,
    error,
    voiceReady,
    transcribedText,
    responseText,
    validationSummary,
    ioBlockedUntil,
    ioBlockedReason,
    metadata: undefined,
  };

  const actions: AgentOrchestratorActions = {
    startListening,
    stopListening,
    stopListeningAndRequestSubmit,
    submit,
    playText,
    cancelPlayback,
    setTranscribedText,
    clearError,
    recoverFromRequestFailure,
  };

  return { state, actions };
}
