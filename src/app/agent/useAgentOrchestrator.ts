/**
 * AgentOrchestrator: single source of truth for agent lifecycle.
 * Owns voice input, request, retrieval/generation, playback, cancellation.
 * Does not know visualization, panel layout, or render-layer details.
 * Emits normalized state and optional listener callbacks for VisualizationController.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, NativeModules, type AppStateStatus } from 'react-native';
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
import type {
  AgentLifecycleState,
  AgentOrchestratorListeners,
  AgentOrchestratorState,
} from './types';

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
const NATIVE_RESTART_GUARD_MS = 250;
const ANDROID_TAIL_GRACE_MS = 200;
/** Brief display of failed state before auto-return to idle (lifecycle timer owns failed → idle). */
const FAILED_DISPLAY_MS = 800;
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

export interface UseAgentOrchestratorOptions {
  /** Optional ref to listeners; orchestrator will call these on lifecycle events. */
  listenersRef?: React.RefObject<AgentOrchestratorListeners | null>;
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
  const { listenersRef } = options;

  const [mode, setMode] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
  const [lifecycle, setLifecycle] = useState<AgentLifecycleState>('idle');
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
  const recordingSessionRef = useRef<string | null>(null);
  const recordingSessionSeqRef = useRef(0);
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
  const ioBlockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Timer for failed → idle transition only; cleared in finalizeStop and on unmount. */
  const failedReturnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        if (lifecycleRef.current === 'listening' || lifecycleRef.current === 'failed' || lifecycleRef.current === 'idle') {
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
      if (failedReturnTimerRef.current) {
        clearTimeout(failedReturnTimerRef.current);
        failedReturnTimerRef.current = null;
      }
      if (finalStabilizationTimerRef.current) {
        clearTimeout(finalStabilizationTimerRef.current);
        finalStabilizationTimerRef.current = null;
      }
      if (iosStopGraceTimerRef.current) {
        clearTimeout(iosStopGraceTimerRef.current);
        iosStopGraceTimerRef.current = null;
        if (Platform.OS === 'ios' && iosStopPendingRef.current && !iosStopInvokedRef.current) {
          logInfo('AgentOrchestrator', 'pending ios stop preserved through settlement', {
            recordingSessionId,
          });
        }
      }
      flushBoundaryAnchorAtRef.current = null;
      finalStabilizationActiveRef.current = false;
      finalCandidateTextRef.current = null;
      finalCandidateSessionIdRef.current = null;
      pendingSubmitWhenReadyRef.current = false;
      pendingSubmitSessionIdRef.current = null;
      settlementResolvedRef.current = false;
      finalizeTranscriptFromPartial(reason, recordingSessionId);
      if (!opts?.keepLifecycle) {
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
    (reason: string, recordingSessionId?: string) => {
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
            resolveSettlement('tailGraceExpired', recordingSessionId);
          }, ANDROID_TAIL_GRACE_MS);
          logInfo('AgentOrchestrator', 'android tail grace scheduled before fallback commit', {
            recordingSessionId,
            graceMs: ANDROID_TAIL_GRACE_MS,
            candidateChars: bestByLength.length,
          });
          return;
        }
      }
      settlementResolvedRef.current = true;
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
        clearTimeout(iosStopGraceTimerRef.current);
        iosStopGraceTimerRef.current = null;
        if (Platform.OS === 'ios' && iosStopPendingRef.current && !iosStopInvokedRef.current) {
          logInfo('AgentOrchestrator', 'pending ios stop preserved through settlement', {
            recordingSessionId,
          });
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
          logLifecycle('AgentOrchestrator', 'lifecycle transition listening -> failed', {
            recordingSessionId,
            reason: 'speech capture failed: no usable transcript',
          });
          logWarn('AgentOrchestrator', 'timeout settlement produced empty transcript; submit skipped', {
            recordingSessionId,
          });
          setMode('idle');
          setLifecycle('failed');
          logInfo('AgentOrchestrator', 'recoverable attempt failed; returning to idle-ready state');
          finalizeStop(reason, recordingSessionId, { keepLifecycle: true });
          if (failedReturnTimerRef.current) {
            clearTimeout(failedReturnTimerRef.current);
            failedReturnTimerRef.current = null;
          }
          failedReturnTimerRef.current = setTimeout(() => {
            failedReturnTimerRef.current = null;
            setAudioState('idleReady', { recordingSessionId, reason: 'failedReturn' });
            setLifecycle('idle');
          }, FAILED_DISPLAY_MS);
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
        if (bestByLength) {
          updateTranscript(bestByLength);
        } else {
          finalizeTranscriptFromPartial('quietWindowExpired', recordingSessionId);
        }
        const normalized = normalizeTranscript(transcribedTextRef.current);
        if (!normalized) {
          logLifecycle('AgentOrchestrator', 'lifecycle transition listening -> failed', {
            recordingSessionId,
            reason: 'speech capture failed: no usable transcript',
          });
          logWarn('AgentOrchestrator', 'quiet window produced empty transcript; submit skipped', {
            recordingSessionId,
          });
          setMode('idle');
          setLifecycle('failed');
          logInfo('AgentOrchestrator', 'recoverable attempt failed; returning to idle-ready state');
          finalizeStop('quietWindowExpired', recordingSessionId, { keepLifecycle: true });
          if (failedReturnTimerRef.current) {
            clearTimeout(failedReturnTimerRef.current);
            failedReturnTimerRef.current = null;
          }
          failedReturnTimerRef.current = setTimeout(() => {
            failedReturnTimerRef.current = null;
            setAudioState('idleReady', { recordingSessionId, reason: 'failedReturn' });
            setLifecycle('idle');
          }, FAILED_DISPLAY_MS);
          return;
        }
      } else {
        logInfo('AgentOrchestrator', 'settlement at flush boundary', { reason, recordingSessionId });
      }
      logInfo('AgentOrchestrator', 'submit triggered after transcript settlement', {
        reason,
        recordingSessionId,
      });
      logInfo('AgentOrchestrator', 'settlement resolved; restart eligible', {
        recordingSessionId,
        pendingSubmitWhenReady: pendingSubmitWhenReadyRef.current,
        settlementResolved: settlementResolvedRef.current,
        finalStabilizationActive: finalStabilizationActiveRef.current,
        quietWindowActive: !!quietWindowTimerRef.current,
        audioStopping: audioStateRef.current === 'stopping',
      });
      listenersRef?.current?.onTranscriptReadyForSubmit?.();
      setAudioState('idleReady', { recordingSessionId, reason: 'settlementResolved' });
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
      finalizeStop(reason, recordingSessionId);
    },
    [finalizeTranscriptFromPartial, finalizeStop, listenersRef, updateTranscript],
  );

  const stopListening = useCallback(async () => {
    const recordingSessionId = recordingSessionRef.current ?? undefined;
    logInfo('AgentOrchestrator', 'voice listen stop requested', { recordingSessionId });
    stopRequestedRef.current = true;
    setAudioState('stopping', { recordingSessionId, reason: 'stopRequested' });
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
  }, [finalizeStop]);

  const stopListeningAndRequestSubmit = useCallback(async () => {
    const recordingSessionId = recordingSessionRef.current ?? undefined;
    logInfo('AgentOrchestrator', 'voice listen stop requested', { recordingSessionId });
    logInfo('AgentOrchestrator', 'transcript finalization started', { recordingSessionId });
    stopRequestedRef.current = true;
    setAudioState('stopping', { recordingSessionId, reason: 'stopForSubmit' });
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
        resolveSettlement('flushWindowExpired', sessionId);
      }
    }, POST_STOP_FLUSH_WINDOW_MS);
  }, [resolveSettlement]);

  const startListening = useCallback(
    async (fresh = false): Promise<{ ok: boolean; reason?: string }> => {
      const V = voiceRef.current;
      if (!V) {
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
          audioStopping: audioStateRef.current === 'stopping',
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
      recordingSessionSeqRef.current += 1;
      const recordingSessionId = `rec-${recordingSessionSeqRef.current}`;
      logInfo('AgentOrchestrator', 'voice listen start requested', {
        recordingSessionId,
        fresh,
        committedChars: committedTextRef.current.length,
      });
      recordingStartAtRef.current = Date.now();
      firstPartialAtRef.current = null;
      firstFinalAtRef.current = null;
      setAudioState('starting', { recordingSessionId });
      try {
        try {
          await V.start('en-US');
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
        setMode('idle');
        setLifecycle('error');
        logError('AgentOrchestrator', 'voice listen start failed', {
          recordingSessionId,
          message,
        });
        return { ok: false, reason: 'startFailed' };
      }
    },
    [applyIoBlock, clearIoBlock, lifecycle, mode, playListenIn, updateTranscript],
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
    if (requestInFlightRef.current) {
      logWarn('AgentOrchestrator', 'submit blocked because active request exists');
      return null;
    }
      const question = normalizeTranscript(transcribedTextRef.current);
    if (!question) {
      logWarn('AgentOrchestrator', 'submit skipped: empty transcript', {
        transcriptChars: transcribedTextRef.current.length,
      });
      return null;
    }
    requestIdRef.current += 1;
    const reqId = requestIdRef.current;
    activeRequestIdRef.current = reqId;
    requestInFlightRef.current = true;
    logInfo('AgentOrchestrator', 'active requestId set', { requestId: reqId });
    setError(null);
    setResponseText(null);
    setValidationSummary(null);
    setMode('processing');
    setLifecycle('retrieving');
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
        );
      }
      logInfo('AgentOrchestrator', 'retrieval completed', { requestId: reqId });
      listenersRef?.current?.onRetrievalEnd?.();
      logInfo('AgentOrchestrator', 'generation started', { requestId: reqId });
      listenersRef?.current?.onGenerationStart?.();
      setLifecycle('thinking');
      const result = await ragAsk(question);
      const nudged = result.nudged;
      setResponseText(nudged);
      setValidationSummary(result.validationSummary);
      logInfo('AgentOrchestrator', 'first token received', { requestId: reqId });
      listenersRef?.current?.onFirstToken?.();
      logInfo('AgentOrchestrator', 'generation completed', { requestId: reqId });
      logInfo('AgentOrchestrator', 'result payload ready', {
        requestId: reqId,
        responseChars: nudged.length,
        rulesCount: result.validationSummary.rules.length,
        cardsCount: result.validationSummary.cards.length,
      });
      listenersRef?.current?.onGenerationEnd?.();
      listenersRef?.current?.onComplete?.();
      if (reqId === activeRequestIdRef.current) {
        requestInFlightRef.current = false;
        logInfo('AgentOrchestrator', 'active requestId cleared', { requestId: reqId });
        setError(null);
        setMode('idle');
        setLifecycle('complete');
        return nudged;
      }
      logWarn('AgentOrchestrator', 'stale completion ignored (non-active request)', {
        requestId: reqId,
        activeRequestId: activeRequestIdRef.current,
      });
      return nudged;
    } catch (e) {
      const msg = errorMessage(e);
      const code =
        e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
      let displayMsg = code ? `[${code}] ${msg}` : msg;
      if (code === 'E_MODEL_PATH' && Platform.OS === 'android') {
        displayMsg += ` Put the chat GGUF in the app's files/models/ folder (filename: ${CHAT_MODEL_FILENAME}).`;
      }
      if (reqId === activeRequestIdRef.current) {
        requestInFlightRef.current = false;
        logInfo('AgentOrchestrator', 'active requestId cleared', { requestId: reqId });
        setResponseText(null);
        setValidationSummary(null);
        logInfo('AgentOrchestrator', 'result context invalidated after failed request', {
          requestId: reqId,
        });
        setError(displayMsg);
        logError('AgentOrchestrator', 'request failed', {
          requestId: reqId,
          message: displayMsg,
        });
        listenersRef?.current?.onError?.();
        setMode('idle');
        setLifecycle('error');
        return null;
      }
      logWarn('AgentOrchestrator', 'stale completion ignored (non-active request)', {
        requestId: reqId,
        activeRequestId: activeRequestIdRef.current,
        message: displayMsg,
      });
      return null;
    }
  }, [listenersRef]);

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
        setMode('speaking');
        setLifecycle('speaking');
        logInfo('AgentOrchestrator', 'playback started');
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
          setMode('idle');
          setLifecycle('complete');
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
        const onFinish = () => {
          setMode('idle');
          setLifecycle('complete');
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
        setMode('speaking');
        setLifecycle('speaking');
        logInfo('AgentOrchestrator', 'playback started');
        listenersRef?.current?.onPlaybackStart?.();
        Tts.speak(normalized);
      } catch (e) {
        if (!playbackInterruptedRef.current) {
          const message = e instanceof Error ? e.message : 'TTS playback failed';
          setError(message);
          setMode('idle');
          setLifecycle('error');
          logError('Playback', 'tts playback failed', { message, textChars: normalized.length });
        }
      }
    },
    [piperAvailable, listenersRef],
  );

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
    setMode('idle');
    setLifecycle(responseText ? 'complete' : 'idle');
    listenersRef?.current?.onPlaybackEnd?.();
    setTimeout(() => {
      playbackInterruptedRef.current = false;
    }, 120);
  }, [listenersRef, responseText]);

  const clearError = useCallback(() => {
    setError(null);
    setLifecycle(responseText ? 'complete' : 'idle');
  }, [responseText]);

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
        V.destroy().then(() => V.removeAllListeners());
        voiceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (failedReturnTimerRef.current) {
        clearTimeout(failedReturnTimerRef.current);
        failedReturnTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (voiceReady) {
      logInfo('AgentOrchestrator', 'initialized');
      logInfo('AgentOrchestrator', 'runtime lifecycle ready');
    }
  }, [voiceReady]);

  const prevLifecycleRef = useRef<AgentLifecycleState>(lifecycle);
  useEffect(() => {
    const prev = prevLifecycleRef.current;
    if (prev !== lifecycle) {
      const details: { requestId?: number } = {};
      if (requestIdRef.current > 0) details.requestId = requestIdRef.current;
      logLifecycle('AgentOrchestrator', `lifecycle transition ${prev} -> ${lifecycle}`, details);
      prevLifecycleRef.current = lifecycle;
    }
  }, [lifecycle]);

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
      logInfo('AgentOrchestrator', 'transcript final updated', {
        recordingSessionId: sessionId,
        chunkChars: next.length,
        totalChars: normalizedCombined.length,
        transcriptText: normalizedCombined,
        transcriptPreview: transcriptPreview(normalizedCombined),
      });
      listenersRef?.current?.onTranscriptUpdate?.();
      if (
        pendingSubmitWhenReadyRef.current &&
        recordingSessionRef.current === pendingSubmitSessionIdRef.current &&
        !settlementResolvedRef.current
      ) {
        const currentCandidate = finalCandidateTextRef.current ?? '';
        if (normalizedCombined.length >= currentCandidate.length) {
          finalCandidateTextRef.current = normalizedCombined;
          finalCandidateSessionIdRef.current = sessionId ?? null;
        }
        finalStabilizationActiveRef.current = true;
        logInfo('AgentOrchestrator', 'final accepted for stabilization candidate (refines only; settlement at flush boundary)', {
          recordingSessionId: sessionId,
          candidateChars: normalizedCombined.length,
          candidateTranscriptText: normalizedCombined,
          candidateTranscriptPreview: transcriptPreview(normalizedCombined),
        });
        if (quietWindowTimerRef.current) {
          clearTimeout(quietWindowTimerRef.current);
          quietWindowTimerRef.current = null;
        }
        if (!finalStabilizationTimerRef.current) {
          logInfo('AgentOrchestrator', 'final stabilization window started (candidate refinement only)', {
            recordingSessionId: sessionId,
          });
          finalStabilizationTimerRef.current = setTimeout(() => {
            finalStabilizationTimerRef.current = null;
            finalStabilizationActiveRef.current = false;
            if (settlementResolvedRef.current) return;
            logInfo('AgentOrchestrator', 'final stabilization window elapsed; candidate held for flush boundary', {
              recordingSessionId: sessionId,
              candidateChars: finalCandidateTextRef.current?.length ?? 0,
            });
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
      const inQuietWindow =
        speechEndedRef.current &&
        pendingSubmitWhenReadyRef.current &&
        !settlementResolvedRef.current;
      logInfo('AgentOrchestrator', 'transcript partial updated', {
        recordingSessionId: recordingSessionRef.current ?? undefined,
        partialChars: normalizedPartial.length,
        transcriptText: normalizedPartial,
        transcriptPreview: transcriptPreview(normalizedPartial),
        ...(inQuietWindow ? { inQuietWindow: true } : {}),
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
          logInfo('AgentOrchestrator', 'quiet window settling current transcript', {
            recordingSessionId: sessionIdForQuiet,
            currentTranscriptChars: currentTranscript.length,
            currentTranscriptText: currentTranscript,
            currentTranscriptPreview: transcriptPreview(currentTranscript),
            finalCandidateChars: finalCandidate.length,
            finalCandidateTranscriptText: finalCandidate,
            finalCandidateTranscriptPreview: transcriptPreview(finalCandidate),
          });
          resolveSettlement('quietWindowExpired', sessionIdForQuiet);
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
    playListenIn,
    playListenOut,
    playError,
    listenersRef,
    updateTranscript,
    finalizeTranscriptFromPartial,
    finalizeStop,
    resolveSettlement,
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

  const emittedLifecycle: AgentLifecycleState = (() => {
    if (lifecycle === 'failed') return 'failed';
    if (error) return 'error';
    return lifecycle;
  })();

  const state: AgentOrchestratorState = {
    lifecycle: emittedLifecycle,
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
