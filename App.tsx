/**
 * CompanionApp
 * @format
 * Voice: @react-native-voice/voice (lazy-loaded to avoid "runtime not ready" on RN 0.84)
 * TTS: Piper (offline) as main voice; fallback to react-native-tts when model not installed
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  LogBox,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { getTheme } from './src/theme';
import { VoiceLoadingView } from './src/ui/VoiceLoadingView';
import {
  createDefaultVizRef,
  NodeMapCanvas,
  TARGET_ACTIVITY_BY_MODE,
  triggerPulseAtCenter,
  type VizMode,
} from './src/nodeMap';
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
} from './src/rag';

// @react-native-voice/voice uses NativeEventEmitter in a way that triggers warnings on new arch (Fabric) when the native module doesn't expose addListener/removeListeners. Voice still works.
LogBox.ignoreLogs([
  'new NativeEventEmitter() was called with a non-null argument without the required `addListener` method',
  'new NativeEventEmitter() was called with a non-null argument without the required `removeListeners` method',
]);

/** Bundle-relative GGUF paths to probe. Android packaging can keep or flatten content_pack/, so probe both layouts. */
const BUNDLE_MODEL_PREFIXES = Array.from(
  new Set([BUNDLE_PACK_ROOT, '', 'content_pack'].filter(Boolean)),
);
const BUNDLE_EMBED_PATH_CANDIDATES = BUNDLE_MODEL_PREFIXES.map(
  prefix => `${prefix}/models/embed/embed.gguf`,
);
const BUNDLE_LLM_PATH_CANDIDATES = BUNDLE_MODEL_PREFIXES.map(
  prefix => `${prefix}/models/llm/model.gguf`,
);

/** Fallback GGUF filenames when using getAppModelsPath (Documents/models). Required when the pack has no models/ (e.g. symlinked or sync-pack-small). */
const EMBED_MODEL_FILENAME = 'nomic-embed-text.gguf';
const CHAT_MODEL_FILENAME = 'llama3.2-3b-Q4_K_M.gguf';
const DEV_APP_STATES: VizMode[] = [
  'idle',
  'listening',
  'processing',
  'speaking',
  'touched',
  'released',
];
const DOUBLE_TAP_MS = 280;

/** Resolves embed and chat model file paths for on-device RAG. Uses bundle paths when present, else pack-in-Documents (content_pack/models/...), else Documents/models with fallback filenames. */
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

  const resolveBundleModelPath = async (
    candidates: string[],
  ): Promise<string> => {
    if (typeof RagPackReader.getBundleFilePath !== 'function') return '';
    for (const candidate of candidates) {
      try {
        const resolved = await RagPackReader.getBundleFilePath(candidate);
        if (resolved && (await fileExists(resolved))) {
          return resolved;
        }
      } catch {
        // keep probing other bundle layouts
      }
    }
    return '';
  };

  try {
    const [embedPath, llmPath] = await Promise.all([
      resolveBundleModelPath(BUNDLE_EMBED_PATH_CANDIDATES),
      resolveBundleModelPath(BUNDLE_LLM_PATH_CANDIDATES),
    ]);
    if (embedPath) embedModelPath = embedPath;
    if (llmPath) chatModelPath = llmPath;
    if (embedModelPath || chatModelPath) {
      console.log(
        '[RAG] Model paths (bundle): embed=',
        embedModelPath || '(none)',
        'chat=',
        chatModelPath || '(none)',
      );
    }
  } catch (e) {
    console.log(
      '[RAG] Bundle model paths not available:',
      e instanceof Error ? e.message : e,
    );
  }

  try {
    if (RagPackReader.getAppModelsPath) {
      modelsDir = await RagPackReader.getAppModelsPath();
      if (modelsDir && typeof modelsDir === 'string') {
        const dir = modelsDir.replace(/\/+$/, '');
        const embedCandidate = `${dir}/${EMBED_MODEL_FILENAME}`;
        const chatCandidate = `${dir}/${CHAT_MODEL_FILENAME}`;
        if (!embedModelPath && (await fileExists(embedCandidate))) {
          embedModelPath = embedCandidate;
        }
        if (!chatModelPath && (await fileExists(chatCandidate))) {
          chatModelPath = chatCandidate;
        }
      }
    }
  } catch (e) {
    console.log(
      '[RAG] App models path not available:',
      e instanceof Error ? e.message : e,
    );
  }

  // On Android bundle paths are not filesystem paths; use pack copied to Documents if available.
  if (packRootInDocuments?.trim()) {
    const root = packRootInDocuments.replace(/\/+$/, '');
    const packEmbed = `${root}/models/embed/embed.gguf`;
    const packLlm = `${root}/models/llm/model.gguf`;
    if (!embedModelPath && (await fileExists(packEmbed))) embedModelPath = packEmbed;
    if (!chatModelPath && (await fileExists(packLlm))) chatModelPath = packLlm;
    if (embedModelPath || chatModelPath) {
      console.log(
        '[RAG] Model paths (pack in Documents): embed=',
        embedModelPath || '(none)',
        'chat=',
        chatModelPath || '(none)',
      );
    }
  }

  if (embedModelPath || chatModelPath) {
    console.log(
      '[RAG] Model paths resolved: embed=',
      embedModelPath || '(none)',
      'chat=',
      chatModelPath || '(none)',
    );
  }
  if (!chatModelPath) {
    console.warn(
      '[RAG] Chat model not found. Searched bundle candidates:',
      BUNDLE_LLM_PATH_CANDIDATES,
      'pack root:',
      packRootInDocuments || '(none)',
      'app models dir:',
      modelsDir || '(unavailable)',
    );
  }
  return { embedModelPath, chatModelPath };
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <VoiceScreen />
    </SafeAreaProvider>
  );
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

function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  const [transcribedText, setTranscribedText] = useState('What is a trigger?');
  const [partialText, setPartialText] = useState('');
  const [mode, setMode] = useState<VizMode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const voiceRef = useRef<VoiceModule | null>(null);
  const ttsRef = useRef<TtsModule | null>(null);
  const committedTextRef = useRef('');
  const [piperAvailable, setPiperAvailable] = useState<boolean | null>(null);
  const [piperDebugInfo, setPiperDebugInfo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [validationSummary, setValidationSummary] =
    useState<ValidationSummary | null>(null);
  const [packStatus, setPackStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [packError, setPackError] = useState<string | null>(null);
  const [showDevScreen, setShowDevScreen] = useState(false);
  const [stateCycleOn, setStateCycleOn] = useState(false);
  const [_devUiVersion, setDevUiVersion] = useState(0);
  const vizRef = useRef(createDefaultVizRef());
  const recordingSessionIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const modeRef = useRef(mode);
  const stateCycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const stateCycleIdxRef = useRef(0);
  const pressStartedWhileListeningRef = useRef(false);
  const longPressTriggeredRef = useRef(false);
  const userModeLongPressActiveRef = useRef(false);
  const lastTapAtRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackInterruptedRef = useRef(false);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_LISTEN_MS = 12000;
  modeRef.current = mode;

  const playListenIn = useCallback(() => {
    console.debug('[Voice] earcon: listen-in');
  }, []);
  const playListenOut = useCallback(() => {
    console.debug('[Voice] earcon: listen-out');
  }, []);
  const playError = useCallback(() => {
    console.debug('[Voice] earcon: error');
  }, []);

  const isListening = mode === 'listening';
  const isAsking = mode === 'processing';
  const isSpeaking = mode === 'speaking';

  useEffect(() => {
    vizRef.current.targetActivity = TARGET_ACTIVITY_BY_MODE[mode];
    vizRef.current.currentMode = mode;
  }, [mode]);

  const theme = getTheme(isDarkMode);
  const textColor = theme.text;
  const mutedColor = theme.textMuted;
  const inputBg = theme.surface;
  const borderColor = theme.border;
  const clamp = (x: number, min: number, max: number) =>
    Math.max(min, Math.min(max, x));

  const getVoiceNative = () => {
    const direct = (NativeModules?.Voice ?? null) as {
      startSpeech?: (
        locale: string,
        opts?: object,
        cb?: (e?: string) => void,
      ) => void;
      stopSpeech?: (cb?: (e?: string) => void) => void;
    } | null;
    const rct = (NativeModules?.RCTVoice ?? null) as {
      startSpeech?: (
        locale: string,
        opts?: object,
        cb?: (e?: string) => void,
      ) => void;
      stopSpeech?: (cb?: (e?: string) => void) => void;
    } | null;

    if (direct?.startSpeech || direct?.stopSpeech) return direct;
    if (rct?.startSpeech || rct?.stopSpeech) return rct;
    return direct ?? rct ?? null;
  };

  const withViz = useCallback(
    (fn: (v: ReturnType<typeof createDefaultVizRef>) => void) => {
      const v = vizRef.current;
      if (!v) return;
      fn(v);
      setDevUiVersion(i => i + 1);
    },
    [],
  );

  const applyVizState = useCallback(
    (state: VizMode) => {
      setMode(state);
      withViz(v => {
        const target = TARGET_ACTIVITY_BY_MODE[state];
        v.targetActivity = target;
        // Make state tests immediately visible instead of waiting on easing.
        v.activity = target;
        if (state === 'touched') {
          v.touchActive = true;
          v.touchWorld = [0, 0, 0];
        } else {
          v.touchActive = false;
          v.touchWorld = null;
        }
      });
      if (state === 'released') {
        triggerPulseAtCenter(vizRef);
      }
    },
    [withViz],
  );

  useEffect(() => {
    if (!stateCycleOn) {
      if (stateCycleTimerRef.current) {
        clearInterval(stateCycleTimerRef.current);
        stateCycleTimerRef.current = null;
      }
      return;
    }
    stateCycleTimerRef.current = setInterval(() => {
      const state =
        DEV_APP_STATES[stateCycleIdxRef.current % DEV_APP_STATES.length]!;
      applyVizState(state);
      stateCycleIdxRef.current =
        (stateCycleIdxRef.current + 1) % DEV_APP_STATES.length;
    }, 1300);
    return () => {
      if (stateCycleTimerRef.current) {
        clearInterval(stateCycleTimerRef.current);
        stateCycleTimerRef.current = null;
      }
    };
  }, [stateCycleOn, applyVizState]);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
    };
  }, []);

  // Lazy-load Voice only after mount so we don't touch native before runtime is ready (RN 0.84).
  // Do not mutate NativeModules (e.g. NativeModules.Voice = ...) — the bridge forbids inserting into the native module proxy.
  useEffect(() => {
    try {
      const VoiceNative = getVoiceNative();
      if (!VoiceNative) {
        setError(
          'Speech recognition not available (native Voice module not linked).',
        );
        setVoiceReady(true);
        voiceRef.current = null;
        setVoiceAvailable(false);
        return;
      }
      const Voice = require('@react-native-voice/voice').default as VoiceModule;
      if (Platform.OS === 'android') {
        console.log('[Voice] native exports', {
          hasVoiceModule: !!NativeModules?.Voice,
          hasRCTVoiceModule: !!NativeModules?.RCTVoice,
          voiceKeys: Object.keys((NativeModules?.Voice ?? {}) as object),
          rctVoiceKeys: Object.keys((NativeModules?.RCTVoice ?? {}) as object),
        });
      }
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
        setVoiceAvailable(false);
        return;
      }
      voiceRef.current = Voice;
      setVoiceReady(true);
      setVoiceAvailable(true);
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

  // Check Piper TTS availability and fetch debug info when not found
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const PiperTts = require('piper-tts').default;
        const available = await PiperTts.isModelAvailable();
        if (!cancelled) setPiperAvailable(available);
        if (!cancelled && !available && PiperTts.getDebugInfo) {
          const info = await PiperTts.getDebugInfo();
          if (!cancelled) setPiperDebugInfo(info ?? null);
        } else if (available) {
          setPiperDebugInfo(null);
        }
      } catch {
        if (!cancelled) setPiperAvailable(false);
        if (!cancelled) {
          try {
            const PiperTts = require('piper-tts').default;
            if (PiperTts.getDebugInfo) {
              const info = await PiperTts.getDebugInfo();
              setPiperDebugInfo(info ?? null);
            }
          } catch {
            setPiperDebugInfo(null);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Attach event handlers when Voice is ready
  useEffect(() => {
    const V = voiceRef.current;
    if (!V) return;

    V.onSpeechResults = e => {
      if (modeRef.current !== 'listening') return;
      const next = (e.value?.[0] ?? '').trim();
      setPartialText('');
      if (!next) return;
      const committed = committedTextRef.current.trim();
      setTranscribedText(committed ? `${committed} ${next}` : next);
      triggerPulseAtCenter(vizRef);
    };
    V.onSpeechPartialResults = e => {
      if (modeRef.current !== 'listening') return;
      setPartialText(e.value?.[0] ?? '');
      triggerPulseAtCenter(vizRef);
    };
    V.onSpeechError = e => {
      setError(e.error?.message ?? 'Speech recognition error');
      playError();
      setMode('idle');
    };
    V.onSpeechEnd = () => {
      playListenOut();
      setMode('idle');
      setPartialText('');
    };

    return () => {
      V.onSpeechResults = null;
      V.onSpeechPartialResults = null;
      V.onSpeechError = null;
      V.onSpeechEnd = null;
    };
  }, [voiceReady, playListenIn, playListenOut, playError]);

  // Defer pack load to first Submit so boot stays fast. Only sync status if already inited.
  useEffect(() => {
    if (getPackState()) setPackStatus('ready');
  }, []);

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
            // ignore fallback errors
          }
        }
      }
    }
    setMode('idle');
    setPartialText('');
  }, []);

  const startListening = useCallback(
    async (fresh = false) => {
      const V = voiceRef.current;
      if (!V) return;
      if (mode === 'processing' || mode === 'speaking') return;
      recordingSessionIdRef.current += 1;
      setError(null);
      setPartialText('');
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
        playListenIn();
        autoStopTimerRef.current = setTimeout(() => {
          if (modeRef.current === 'listening') {
            stopListening();
          }
          autoStopTimerRef.current = null;
        }, MAX_LISTEN_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start voice');
        setMode('idle');
      }
    },
    [transcribedText, mode, stopListening, playListenIn],
  );

  // Stop listening when app goes to background so mic does not stay on.
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

  const handleSubmit = useCallback(async (): Promise<string | null> => {
    const question = transcribedText.trim().replace(/\s+/g, ' ');
    if (!question) return null;
    requestIdRef.current += 1;
    const reqId = requestIdRef.current;
    setError(null);
    setResponseText(null);
    setValidationSummary(null);
    setMode('processing');
    try {
      if (!getPackState()) {
        setPackStatus('loading');
        setPackError(null);
        let packRoot = await getContentPackPathInDocuments();
        if (!packRoot) {
          try {
            packRoot = await copyBundlePackToDocuments();
          } catch (e) {
            console.log(
              '[RAG] Copy pack to Documents failed, using bundle:',
              e instanceof Error ? e.message : e,
            );
            packRoot = '';
          }
        }
        const reader =
          (packRoot ? createDocumentsPackReader(packRoot) : null) ??
          createBundlePackReader() ??
          createThrowReader(
            'Pack not configured. Add the content pack to assets/content_pack and rebuild the app.',
          );
        console.log('[RAG] Pack root:', packRoot || '(bundle)');
        const embedModelId = await getPackEmbedModelId(reader);
        const { embedModelPath, chatModelPath } = await getOnDeviceModelPaths(packRoot || undefined);
        await ragInit(
          {
            embedModelId,
            embedModelPath,
            chatModelPath,
            packRoot: packRoot || '',
          },
          reader,
        );
        setPackStatus('ready');
      }
      const result = await ragAsk(question);
      const nudged = result.nudged;
      setResponseText(nudged);
      setValidationSummary(result.validationSummary);
      triggerPulseAtCenter(vizRef);
      if (
        result.validationSummary &&
        (result.validationSummary.stats.unknownCardCount > 0 ||
          result.validationSummary.stats.invalidRuleCount > 0)
      ) {
        console.info(
          '[RAG] requestId=',
          reqId,
          'validationSummary=',
          result.validationSummary.stats,
        );
      }
      console.log('[RAG] requestId=', reqId, 'Full response (nudged):', nudged);
      setMode('idle');
      return nudged;
    } catch (e) {
      const msg = errorMessage(e);
      const code =
        e && typeof e === 'object' && 'code' in e
          ? (e as { code: string }).code
          : '';
      setError(code ? `[${code}] ${msg}` : msg);
      if (!getPackState()) {
        setPackStatus('error');
        setPackError(msg);
      }
      console.warn(
        '[RAG] error requestId=',
        reqId,
        'code=',
        code,
        'message=',
        msg,
      );
      setMode('idle');
      return null;
    }
  }, [transcribedText]);

  const handleClear = useCallback(() => {
    setTranscribedText('');
    setPartialText('');
  }, []);

  const playText = useCallback(
    async (text: string) => {
      const normalized = text.trim();
      if (!normalized) {
        console.log('[Playback] empty text, skipping');
        return;
      }
      setError(null);
      playbackInterruptedRef.current = false;
      console.log('[Playback] start', {
        piperAvailable,
        textLength: normalized.length,
      });
      // Prefer Piper (offline) as the main TTS voice when the model is available
      if (piperAvailable) {
        const PiperTts = require('piper-tts').default;
        const options = {
          lengthScale: 1.08,
          noiseScale: 0.62,
          noiseW: 0.8,
          gainDb: 0,
          interSentenceSilenceMs: 250,
          interCommaSilenceMs: 125,
        };
        console.log('[Playback] Piper: setOptions before speak', options);
        PiperTts.setOptions(options);
        console.log('[Playback] Piper path: starting speak', {
          textLength: normalized.length,
          preview: normalized.slice(0, 40),
        });
        setMode('speaking');
        try {
          console.log('[Playback] Piper: calling PiperTts.speak()…');
          await PiperTts.speak(normalized);
          console.log('[Playback] Piper: speak() resolved (playback finished)');
        } catch (e) {
          if (playbackInterruptedRef.current) return;
          console.log('[Playback] Piper: speak() rejected', e);
          setError(e instanceof Error ? e.message : 'Piper playback failed');
        } finally {
          setMode('idle');
          console.log('[Playback] Piper: isSpeaking set to false');
        }
        return;
      }
      // Fallback to system TTS when Piper model is not installed
      console.log('[Playback] using system TTS');
      let Tts: TtsModule;
      try {
        Tts = require('react-native-tts').default as TtsModule;
        ttsRef.current = Tts;
      } catch (e) {
        console.log('[Playback] system TTS failed to load', e);
        setError(e instanceof Error ? e.message : 'TTS failed to load');
        return;
      }
      try {
        await Tts.getInitStatus();
        if (Platform.OS === 'android') {
          Tts.stop();
        }
        const onFinish = () => {
          setMode('idle');
          Tts.removeEventListener('tts-finish', onFinish);
          Tts.removeEventListener('tts-cancel', onFinish);
        };
        Tts.addEventListener('tts-finish', onFinish);
        Tts.addEventListener('tts-cancel', onFinish);
        setMode('speaking');
        console.log('[Playback] system TTS: calling speak()');
        Tts.speak(normalized);
      } catch (e) {
        if (playbackInterruptedRef.current) return;
        console.log('[Playback] system TTS error', e);
        setError(e instanceof Error ? e.message : 'TTS playback failed');
        setMode('idle');
      }
    },
    [piperAvailable],
  );

  const cancelPlayback = useCallback(() => {
    playbackInterruptedRef.current = true;
    try {
      const PiperTts = require('piper-tts').default;
      if (typeof PiperTts?.stop === 'function') {
        PiperTts.stop();
      }
    } catch {
      // ignore
    }
    try {
      ttsRef.current?.stop();
    } catch {
      // ignore
    }
    setMode('idle');
    setTimeout(() => {
      playbackInterruptedRef.current = false;
    }, 120);
  }, []);

  const handlePlayback = useCallback(async () => {
    const text = (partialText || transcribedText).trim();
    if (!text) {
      console.log('[Playback] no text, skipping');
      return;
    }
    await playText(text);
  }, [partialText, transcribedText, playText]);

  const handleUserModeTap = useCallback(() => {
    const now = Date.now();
    const sinceLast = now - lastTapAtRef.current;
    if (sinceLast > 0 && sinceLast <= DOUBLE_TAP_MS) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapAtRef.current = 0;
      const answer = (responseText ?? '').trim();
      if (!answer) return;
      playText(answer);
      return;
    }
    lastTapAtRef.current = now;
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
    }
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      cancelPlayback();
    }, DOUBLE_TAP_MS + 20);
  }, [responseText, playText, cancelPlayback]);

  const handleUserModeLongPressStart = useCallback(() => {
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
    lastTapAtRef.current = 0;
    userModeLongPressActiveRef.current = true;
    startListening(true);
  }, [startListening]);

  const handleUserModeLongPressEnd = useCallback(() => {
    if (!userModeLongPressActiveRef.current) return;
    userModeLongPressActiveRef.current = false;
    (async () => {
      await stopListening();
      setTimeout(() => {
        handleSubmit();
      }, 250);
    })();
  }, [stopListening, handleSubmit]);

  const displayText = partialText || transcribedText;

  if (!voiceReady && !error) {
    return (
      <VoiceLoadingView theme={theme} paddingTop={insets.top} />
    );
  }

  return (
    <View style={styles.screenWrapper}>
      <NodeMapCanvas
        vizRef={vizRef}
        controlsEnabled={showDevScreen}
        inputEnabled
        canvasBackground={theme.viz.canvasBackground}
        onShortTap={!showDevScreen ? handleUserModeTap : undefined}
        onLongPressStart={
          !showDevScreen ? handleUserModeLongPressStart : undefined
        }
        onLongPressEnd={!showDevScreen ? handleUserModeLongPressEnd : undefined}
      />
      {showDevScreen && (
        <ScrollView
          style={[styles.container, styles.scrollOverlay]}
          contentContainerStyle={{
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <Text style={[styles.title, { color: textColor }]}>Developer</Text>

          <View style={styles.piperStatusRow}>
            <Text style={[styles.piperStatusLabel, { color: mutedColor }]}>
              Piper model:{' '}
            </Text>
            {piperAvailable === null ? (
              <Text style={[styles.piperStatusValue, { color: mutedColor }]}>
                Checking…
              </Text>
            ) : piperAvailable === true ? (
              <Text style={[styles.piperStatusValue, styles.piperStatusOk]}>
                ✓ File present
              </Text>
            ) : (
              <Text
                style={[styles.piperStatusValue, styles.piperStatusMissing]}
              >
                Not found — run: pnpm run download-piper then rebuild
                (ios/android).
              </Text>
            )}
          </View>
          {piperAvailable === false && piperDebugInfo ? (
            <View style={styles.piperDebugBox}>
              <Text
                style={[styles.piperDebugText, { color: mutedColor }]}
                selectable
              >
                {piperDebugInfo}
              </Text>
            </View>
          ) : null}

          <View style={styles.packStatusRow}>
            <Text style={[styles.packStatusLabel, { color: mutedColor }]}>
              Content pack:{' '}
            </Text>
            {packStatus === 'loading' ? (
              <View style={styles.packStatusValueRow}>
                <ActivityIndicator size="small" color={mutedColor} />
                <Text style={[styles.packStatusValue, { color: mutedColor }]}>
                  Loading…
                </Text>
              </View>
            ) : packStatus === 'ready' ? (
              <Text style={[styles.packStatusValue, styles.packStatusOk]}>
                Ready
              </Text>
            ) : packStatus === 'error' ? (
              <Text
                style={[styles.packStatusValue, styles.packStatusMissing]}
                numberOfLines={2}
              >
                Error: {packError ?? 'Unknown'}
              </Text>
            ) : (
              <Text style={[styles.packStatusValue, { color: mutedColor }]}>
                Not loaded
              </Text>
            )}
          </View>

          <View
            style={[
              styles.devToolsCard,
              { backgroundColor: inputBg, borderColor },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: mutedColor }]}>
              Dev Tools
            </Text>

            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                Show viz
              </Text>
              <Pressable
                onPress={() =>
                  withViz(v => {
                    v.showViz = !v.showViz;
                  })
                }
              >
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {vizRef.current?.showViz ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                Show connections
              </Text>
              <Pressable
                onPress={() =>
                  withViz(v => {
                    v.showConnections = !v.showConnections;
                  })
                }
              >
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {vizRef.current?.showConnections ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                Star count mult
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.starCountMultiplier = clamp(
                        v.starCountMultiplier - 0.2,
                        0.1,
                        3,
                      );
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {(vizRef.current?.starCountMultiplier ?? 1).toFixed(1)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.starCountMultiplier = clamp(
                        v.starCountMultiplier + 0.2,
                        0.1,
                        3,
                      );
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              style={styles.devToolsButton}
              onPress={() => triggerPulseAtCenter(vizRef)}
            >
              <Text style={[styles.devToolsButtonText, { color: textColor }]}>
                Debug pulse
              </Text>
            </Pressable>

            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                Cycle states
              </Text>
              <Pressable onPress={() => setStateCycleOn(x => !x)}>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {stateCycleOn ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.devToolsStateGrid}>
              {DEV_APP_STATES.map(state => (
                <Pressable
                  key={state}
                  style={styles.devToolsStateButton}
                  onPress={() => applyVizState(state)}
                >
                  <Text
                    style={[
                      styles.devToolsStateButtonText,
                      { color: textColor },
                    ]}
                  >
                    {state}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                Post FX
              </Text>
              <Pressable
                onPress={() =>
                  withViz(v => {
                    v.postFxEnabled = !v.postFxEnabled;
                  })
                }
              >
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {vizRef.current?.postFxEnabled ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                Vignette
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.postFxVignette = clamp(v.postFxVignette - 0.05, 0, 1);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {(vizRef.current?.postFxVignette ?? 0).toFixed(2)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.postFxVignette = clamp(v.postFxVignette + 0.05, 0, 1);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                Chromatic
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.postFxChromatic = clamp(
                        v.postFxChromatic - 0.0005,
                        0,
                        0.01,
                      );
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {(vizRef.current?.postFxChromatic ?? 0).toFixed(4)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.postFxChromatic = clamp(
                        v.postFxChromatic + 0.0005,
                        0,
                        0.01,
                      );
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                Grain
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.postFxGrain = clamp(v.postFxGrain - 0.01, 0, 0.2);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {(vizRef.current?.postFxGrain ?? 0).toFixed(2)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.postFxGrain = clamp(v.postFxGrain + 0.01, 0, 0.2);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                activityLambda
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.activityLambda = clamp(v.activityLambda - 1, 0.5, 20);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {(vizRef.current?.activityLambda ?? 0).toFixed(1)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.activityLambda = clamp(v.activityLambda + 1, 0.5, 20);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                lambdaUp
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.lambdaUp = clamp(v.lambdaUp - 1, 0.5, 20);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {(vizRef.current?.lambdaUp ?? 0).toFixed(1)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.lambdaUp = clamp(v.lambdaUp + 1, 0.5, 20);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                lambdaDown
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.lambdaDown = clamp(v.lambdaDown - 1, 0.5, 20);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {(vizRef.current?.lambdaDown ?? 0).toFixed(1)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.lambdaDown = clamp(v.lambdaDown + 1, 0.5, 20);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                paletteId
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.paletteId = Math.max(0, Math.floor(v.paletteId - 1));
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {Math.floor(vizRef.current?.paletteId ?? 0)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.paletteId = Math.max(0, Math.floor(v.paletteId + 1));
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                hueShift
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.hueShift = clamp(v.hueShift - 0.02, -0.1, 0.1);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {(vizRef.current?.hueShift ?? 0).toFixed(2)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.hueShift = clamp(v.hueShift + 0.02, -0.1, 0.1);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                satBoost
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.satBoost = clamp(v.satBoost - 0.1, 0.5, 1.5);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {(vizRef.current?.satBoost ?? 0).toFixed(1)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.satBoost = clamp(v.satBoost + 0.1, 0.5, 1.5);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.devToolsRow}>
              <Text style={[styles.devToolsLabel, { color: textColor }]}>
                lumBoost
              </Text>
              <View style={styles.devToolsStepper}>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.lumBoost = clamp(v.lumBoost - 0.1, 0.5, 1.5);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    -
                  </Text>
                </Pressable>
                <Text style={[styles.devToolsValue, { color: mutedColor }]}>
                  {(vizRef.current?.lumBoost ?? 0).toFixed(1)}
                </Text>
                <Pressable
                  onPress={() =>
                    withViz(v => {
                      v.lumBoost = clamp(v.lumBoost + 0.1, 0.5, 1.5);
                    })
                  }
                >
                  <Text
                    style={[styles.devToolsButtonText, { color: textColor }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: mutedColor }]}>
            Question
          </Text>
          <View
            style={[styles.textBox, { backgroundColor: inputBg, borderColor }]}
          >
            <TextInput
              style={[styles.textInput, { color: textColor }]}
              placeholder="Type or speak your question..."
              placeholderTextColor={mutedColor}
              value={displayText}
              onChangeText={t => {
                if (!partialText) setTranscribedText(t);
              }}
              editable={!isListening}
              multiline
            />
            {partialText ? (
              <Text style={[styles.partialHint, { color: mutedColor }]}>
                Listening...
              </Text>
            ) : null}
            <Pressable
              style={[styles.playbackButton, { borderColor }]}
              onPress={handlePlayback}
              disabled={!displayText.trim() || isSpeaking}
            >
              {isSpeaking ? (
                <View
                  style={[
                    styles.playbackButtonContent,
                    styles.playbackSpeakingRow,
                  ]}
                >
                  <ActivityIndicator size="small" color={textColor} />
                  <Text
                    style={[
                      styles.playbackHint,
                      styles.playbackSpeakingHint,
                      { color: mutedColor },
                    ]}
                  >
                    Synthesizing…
                  </Text>
                </View>
              ) : (
                <View style={styles.playbackButtonContent}>
                  <Text style={[styles.playbackLabel, { color: textColor }]}>
                    ▶ {piperAvailable ? 'Play (Piper)' : 'Playback'}
                  </Text>
                  {piperAvailable === true && (
                    <Text style={[styles.playbackHint, { color: mutedColor }]}>
                      Offline voice
                    </Text>
                  )}
                </View>
              )}
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={[styles.sectionLabel, { color: mutedColor }]}>
            Response
          </Text>
          {isAsking ? (
            <View
              style={[
                styles.responseBox,
                styles.responseLoadingRow,
                { backgroundColor: inputBg, borderColor },
              ]}
            >
              <ActivityIndicator size="small" color={textColor} />
              <Text
                style={[
                  styles.responseLabel,
                  styles.responseLabelInline,
                  { color: mutedColor },
                ]}
              >
                Loading…
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.responseBox,
                { backgroundColor: inputBg, borderColor },
              ]}
            >
              <Text style={[styles.responseLabel, { color: mutedColor }]}>
                Answer
              </Text>
              {responseText != null ? (
                <>
                  <Text
                    style={[styles.responseText, { color: textColor }]}
                    selectable
                  >
                    {responseText}
                  </Text>
                  {validationSummary &&
                  (validationSummary.stats.unknownCardCount > 0 ||
                    validationSummary.stats.invalidRuleCount > 0) ? (
                    <Text
                      style={[styles.validationHint, { color: mutedColor }]}
                    >
                      Corrected {validationSummary.stats.unknownCardCount}{' '}
                      name(s), {validationSummary.stats.invalidRuleCount}{' '}
                      rule(s) invalid.
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text
                  style={[styles.responsePlaceholder, { color: mutedColor }]}
                >
                  Submit a question to see the answer here.
                </Text>
              )}
            </View>
          )}

          <View style={[styles.buttons, styles.buttonsCompactTop]}>
            <Pressable
              style={[
                styles.button,
                styles.micButton,
                isListening && styles.micButtonActive,
                !voiceReady && styles.buttonDisabled,
              ]}
              onPressIn={() => {
                longPressTriggeredRef.current = false;
                pressStartedWhileListeningRef.current =
                  modeRef.current === 'listening';
                setMode('touched');
                vizRef.current.touchActive = true;
                vizRef.current.touchWorld = [0, 0, 0];
              }}
              onLongPress={() => {
                longPressTriggeredRef.current = true;
                (async () => {
                  if (modeRef.current === 'listening') {
                    await stopListening();
                  }
                  const answer = await handleSubmit();
                  if (answer) {
                    await playText(answer);
                  }
                })();
              }}
              delayLongPress={500}
              onPressOut={() => {
                vizRef.current.touchActive = false;
                vizRef.current.touchWorld = null;
                if (longPressTriggeredRef.current) {
                  return;
                }
                setMode('released');
                if (pressStartedWhileListeningRef.current) {
                  stopListening();
                } else {
                  startListening();
                }
              }}
              disabled={
                !voiceReady || !voiceAvailable || isAsking || isSpeaking
              }
            >
              {isListening ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.micButtonLabel}>Start voice</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.button, { borderColor }]}
              onPress={handleClear}
            >
              <Text style={[styles.submitButtonLabel, { color: textColor }]}>
                Clear
              </Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.submitButton, { borderColor }]}
              onPress={handleSubmit}
              disabled={isAsking || isSpeaking}
            >
              <Text style={styles.submitButtonLabel}>
                {isAsking ? '…' : 'Submit'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
      <Pressable
        style={[
          styles.devToggle,
          {
            bottom: (insets.bottom || 16) + 12,
          },
        ]}
        onPress={() => setShowDevScreen(prev => !prev)}
      >
        <Text style={styles.devToggleLabel}>
          {showDevScreen ? 'User' : 'Dev'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
  },
  scrollOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loader: {
    marginTop: 24,
  },
  hint: {
    marginTop: 12,
    fontSize: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  piperStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 12,
  },
  piperStatusLabel: {
    fontSize: 12,
  },
  piperStatusValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  piperStatusOk: {
    color: '#16a34a',
  },
  packStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 12,
  },
  packStatusLabel: {
    fontSize: 12,
  },
  packStatusValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  packStatusValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  packStatusOk: {
    color: '#16a34a',
  },
  packStatusMissing: {
    color: '#dc2626',
    flex: 1,
  },
  piperStatusMissing: {
    color: '#b45309',
  },
  piperDebugBox: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 6,
  },
  piperDebugText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textBox: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 96,
    padding: 10,
    marginBottom: 8,
  },
  textInput: {
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  partialHint: {
    fontSize: 12,
    marginTop: 4,
  },
  playbackButton: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  playbackButtonContent: {
    gap: 2,
  },
  playbackSpeakingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playbackSpeakingHint: {
    marginLeft: 8,
  },
  playbackLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  playbackHint: {
    fontSize: 10,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    marginBottom: 6,
  },
  responseBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  responseLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  responseLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  responseLabelInline: {
    marginBottom: 0,
  },
  responseText: {
    fontSize: 13,
    lineHeight: 18,
  },
  responsePlaceholder: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  validationHint: {
    fontSize: 10,
    marginTop: 6,
  },
  buttons: {
    gap: 8,
  },
  buttonsCompactTop: {
    marginTop: 4,
  },
  button: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  micButton: {
    backgroundColor: '#0a7ea4',
  },
  micButtonActive: {
    backgroundColor: '#c53030',
  },
  micButtonLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#22c55e',
    borderWidth: 1,
  },
  submitButtonLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  devToolsCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  devToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  devToolsLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  devToolsValue: {
    fontSize: 11,
    fontWeight: '500',
  },
  devToolsStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  devToolsButton: {
    paddingVertical: 6,
    marginTop: 2,
  },
  devToolsButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  devToolsStateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  devToolsStateButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  devToolsStateButtonText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  devToggle: {
    position: 'absolute',
    right: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  devToggleLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default App;
