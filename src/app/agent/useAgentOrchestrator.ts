/**
 * AgentOrchestrator: single source of truth for agent lifecycle.
 * Owns voice input, request, retrieval/generation, playback, cancellation.
 * Does not know visualization, panel layout, or render-layer details.
 * Emits normalized state and optional listener callbacks for VisualizationController.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { NativeModules, Platform } from 'react-native';
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
const MAX_LISTEN_MS = 12000;

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

  if (!chatModelPath && (embedModelPath || chatModelPath)) {
    console.log('[RAG] Model paths:', { embed: embedModelPath || null, chat: chatModelPath || null });
  }
  return { embedModelPath, chatModelPath };
}

export interface UseAgentOrchestratorOptions {
  /** Optional ref to listeners; orchestrator will call these on lifecycle events. */
  listenersRef?: React.RefObject<AgentOrchestratorListeners | null>;
}

export interface AgentOrchestratorActions {
  startListening: (fresh?: boolean) => Promise<void>;
  stopListening: () => Promise<void>;
  submit: () => Promise<string | null>;
  playText: (text: string) => Promise<void>;
  cancelPlayback: () => void;
  setTranscribedText: (text: string) => void;
  clearError: () => void;
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

  const voiceRef = useRef<VoiceModule | null>(null);
  const ttsRef = useRef<TtsModule | null>(null);
  const committedTextRef = useRef('');
  const modeRef = useRef(mode);
  const playbackInterruptedRef = useRef(false);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  modeRef.current = mode;

  const playListenIn = useCallback(() => {
    listenersRef?.current?.onListeningStart?.();
  }, [listenersRef]);
  const playListenOut = useCallback(() => {
    listenersRef?.current?.onListeningEnd?.();
  }, [listenersRef]);
  const playError = useCallback(() => {
    listenersRef?.current?.onError?.();
  }, [listenersRef]);

  const stopListening = useCallback(async () => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    const V = voiceRef.current;
    if (V) {
      try {
        await V.stop();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const nativeVoice = getVoiceNative();
        if (
          msg.toLowerCase().includes('stopspeech is null') &&
          typeof nativeVoice?.stopSpeech === 'function'
        ) {
          try {
            await nativeVoice.stopSpeech();
          } catch {
            /* ignore */
          }
        }
      }
    }
    setMode('idle');
    setLifecycle('idle');
    listenersRef?.current?.onListeningEnd?.();
  }, [listenersRef]);

  const startListening = useCallback(
    async (fresh = false) => {
      const V = voiceRef.current;
      if (!V) return;
      if (mode === 'processing' || mode === 'speaking') return;
      setError(null);
      if (fresh) {
        committedTextRef.current = '';
        setTranscribedText('');
      } else {
        committedTextRef.current = transcribedText;
      }
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
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
        setMode('listening');
        setLifecycle('listening');
        playListenIn();
        autoStopTimerRef.current = setTimeout(() => {
          if (modeRef.current === 'listening') stopListening();
          autoStopTimerRef.current = null;
        }, MAX_LISTEN_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start voice');
        setMode('idle');
        setLifecycle('error');
      }
    },
    [transcribedText, mode, stopListening, playListenIn],
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
    const question = transcribedText.trim().replace(/\s+/g, ' ');
    if (!question) return null;
    requestIdRef.current += 1;
    const reqId = requestIdRef.current;
    setError(null);
    setResponseText(null);
    setValidationSummary(null);
    setMode('processing');
    setLifecycle('retrieving');
    listenersRef?.current?.onRequestStart?.();
    listenersRef?.current?.onRetrievalStart?.();
    try {
      if (!getPackState()) {
        let packRoot: string;
        try {
          packRoot = await copyBundlePackToDocuments();
        } catch (e) {
          console.log(
            '[RAG] Copy pack to Documents failed, using bundle:',
            e instanceof Error ? e.message : e,
          );
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
      listenersRef?.current?.onRetrievalEnd?.();
      listenersRef?.current?.onGenerationStart?.();
      setLifecycle('thinking');
      const result = await ragAsk(question);
      const nudged = result.nudged;
      setResponseText(nudged);
      setValidationSummary(result.validationSummary);
      listenersRef?.current?.onGenerationEnd?.();
      listenersRef?.current?.onComplete?.();
      setMode('idle');
      setLifecycle('complete');
      return nudged;
    } catch (e) {
      const msg = errorMessage(e);
      const code =
        e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
      let displayMsg = code ? `[${code}] ${msg}` : msg;
      if (code === 'E_MODEL_PATH' && Platform.OS === 'android') {
        displayMsg += ` Put the chat GGUF in the app's files/models/ folder (filename: ${CHAT_MODEL_FILENAME}).`;
      }
      setError(displayMsg);
      listenersRef?.current?.onError?.();
      setMode('idle');
      setLifecycle('error');
      return null;
    }
  }, [transcribedText, listenersRef]);

  const playText = useCallback(
    async (text: string) => {
      const normalized = text.trim();
      if (!normalized) return;
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
        listenersRef?.current?.onPlaybackStart?.();
        try {
          await PiperTts.speak(normalized);
        } catch (e) {
          if (!playbackInterruptedRef.current)
            setError(e instanceof Error ? e.message : 'Piper playback failed');
        } finally {
          setMode('idle');
          setLifecycle('complete');
          listenersRef?.current?.onPlaybackEnd?.();
        }
        return;
      }
      let Tts: TtsModule;
      try {
        Tts = require('react-native-tts').default as TtsModule;
        ttsRef.current = Tts;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'TTS failed to load');
        return;
      }
      try {
        await Tts.getInitStatus();
        if (Platform.OS === 'android') Tts.stop();
        const onFinish = () => {
          setMode('idle');
          setLifecycle('complete');
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
        listenersRef?.current?.onPlaybackStart?.();
        Tts.speak(normalized);
      } catch (e) {
        if (!playbackInterruptedRef.current) {
          setError(e instanceof Error ? e.message : 'TTS playback failed');
          setMode('idle');
          setLifecycle('error');
        }
      }
    },
    [piperAvailable, listenersRef],
  );

  const cancelPlayback = useCallback(() => {
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
  }, [listenersRef]);

  const clearError = useCallback(() => {
    setError(null);
    setLifecycle(responseText ? 'complete' : 'idle');
  }, [responseText]);

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
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
      const V = voiceRef.current;
      if (V) {
        V.destroy().then(() => V.removeAllListeners());
        voiceRef.current = null;
      }
    };
  }, []);

  // Voice event handlers: update transcript and notify for pulse
  useEffect(() => {
    const V = voiceRef.current;
    if (!V) return;
    V.onSpeechResults = e => {
      if (modeRef.current !== 'listening') return;
      const next = (e.value?.[0] ?? '').trim();
      if (!next) return;
      const committed = committedTextRef.current.trim();
      setTranscribedText(committed ? `${committed} ${next}` : next);
      listenersRef?.current?.onTranscriptUpdate?.();
    };
    V.onSpeechPartialResults = () => {
      if (modeRef.current !== 'listening') return;
      listenersRef?.current?.onTranscriptUpdate?.();
    };
    V.onSpeechError = e => {
      setError(e.error?.message ?? 'Speech recognition error');
      playError();
      setMode('idle');
      setLifecycle('error');
    };
    V.onSpeechEnd = () => {
      playListenOut();
      setMode('idle');
      setLifecycle('idle');
    };
    return () => {
      V.onSpeechResults = null;
      V.onSpeechPartialResults = null;
      V.onSpeechError = null;
      V.onSpeechEnd = null;
    };
  }, [voiceReady, playListenIn, playListenOut, playError, listenersRef]);

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
        .then((path: string) => path && console.log('[Piper] Model copied to', path))
        .catch((e: unknown) =>
          console.warn('[Piper] copyModelToFiles failed:', e instanceof Error ? e.message : e),
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

  const state: AgentOrchestratorState = {
    lifecycle: error ? 'error' : lifecycle,
    error,
    voiceReady,
    transcribedText,
    responseText,
    validationSummary,
    metadata: undefined,
  };

  const actions: AgentOrchestratorActions = {
    startListening,
    stopListening,
    submit,
    playText,
    cancelPlayback,
    setTranscribedText,
    clearError,
  };

  return { state, actions };
}
