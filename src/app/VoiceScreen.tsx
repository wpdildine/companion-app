/**
 * Main voice screen: node map canvas, hold-to-speak, panels, and debug overlay.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  NativeModules,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
} from '../rag';
import { CardReferenceBlock, type CardRef } from '../shared/components/CardReferenceBlock';
import { DeconPanel } from '../shared/components/DeconPanel';
import { SelectedRulesBlock, type SelectedRule } from '../shared/components/SelectedRulesBlock';
import { VoiceLoadingView, DebugZoneOverlay, UserVoiceView, DevScreen } from '../ui';
import { getTheme } from '../theme';
import {
  createDefaultNodeMapRef,
  triggerPulseAtCenter,
  type NodeMapMode,
  type AiUiSignals,
  NodeMapSurface,
  NodeMapInteractionBand,
} from '../nodeMap';
import type { NodeMapPanelRects } from '../nodeMap/types';
import { useAiVizBridge } from './hooks/useAiVizBridge';

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
const DEV_APP_STATES: NodeMapMode[] = [
  'idle',
  'listening',
  'processing',
  'speaking',
  'touched',
  'released',
];
const DOUBLE_TAP_MS = 280;

/** Single gate for debug layer; when false, DevPanel is not in the tree. */
const DEBUG_ENABLED_DEFAULT = false;

/** When true, skip real RAG and inject dummy resolved payload for instrument-panel verification. */
const DEBUG_SCENARIO = true;
const SHOW_REVEAL_CHIPS = false;

const dummySignals: AiUiSignals = {
  phase: 'resolved',
  grounded: true,
  confidence: 0.82,
  retrievalDepth: 3,
  cardRefsCount: 2,
  event: null,
};

const dummyAnswer = `
Blood Moon turns all nonbasic lands into Mountains.
This removes their abilities unless those abilities are intrinsic to being a Mountain.
Continuous effects are applied in layer 4 and layer 6 depending on the interaction.
`;

const dummyCards: CardRef[] = [
  {
    id: 'blood-moon',
    name: 'Blood Moon',
    imageUri: undefined,
    typeLine: 'Enchantment',
    manaCost: '{2}{R}',
    oracle: 'Nonbasic lands are Mountains.',
  },
  {
    id: 'urborg',
    name: 'Urborg, Tomb of Yawgmoth',
    imageUri: undefined,
    typeLine: 'Legendary Land',
    manaCost: '',
    oracle: 'Each land is a Swamp in addition to its other land types.',
  },
];

const dummyRules: SelectedRule[] = [
  {
    id: '613.1',
    title: 'Layer System',
    excerpt:
      'The values of objects are determined by applying continuous effects in a series of layers.',
    used: true,
  },
  {
    id: '305.7',
    title: 'Land Type Changing Effects',
    excerpt:
      "If an effect sets a land's subtype to one or more basic land types, the land loses all abilities and gains the corresponding mana abilities.",
    used: true,
  },
  {
    id: '604.1',
    title: 'Static Abilities',
    excerpt:
      'Static abilities do something all the time rather than being activated or triggered.',
    used: false,
  },
];

/** Resolve embed + chat model paths: pack in Documents (primary on Android), then bundle, then app files/models/. */
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
        /* try next candidate */
      }
    }
    return '';
  };

  if (packRootInDocuments?.trim()) {
    const root = packRootInDocuments.replace(/\/+$/, '');
    if (typeof RagPackReader.readFileAtPath === 'function') {
      try {
        const manifestJson = await RagPackReader.readFileAtPath(
          `${root}/manifest.json`,
        );
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
        /* use hardcoded pack paths below */
      }
    }
    const packEmbed = `${root}/models/embed/embed.gguf`;
    const packLlm = `${root}/models/llm/model.gguf`;
    if (!embedModelPath && (await fileExists(packEmbed)))
      embedModelPath = packEmbed;
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
      /* bundle not available (e.g. Android) */
    }
  }

  if (!embedModelPath || !chatModelPath) {
    try {
      if (RagPackReader.getAppModelsPath) {
        modelsDir = await RagPackReader.getAppModelsPath();
        if (modelsDir && typeof modelsDir === 'string') {
          const dir = modelsDir.replace(/\/+$/, '');
          if (
            !embedModelPath &&
            (await fileExists(`${dir}/${EMBED_MODEL_FILENAME}`))
          )
            embedModelPath = `${dir}/${EMBED_MODEL_FILENAME}`;
          if (
            !chatModelPath &&
            (await fileExists(`${dir}/${CHAT_MODEL_FILENAME}`))
          )
            chatModelPath = `${dir}/${CHAT_MODEL_FILENAME}`;
        }
      }
    } catch {
      /* app models path not available */
    }
  }

  if (embedModelPath || chatModelPath) {
    console.log('[RAG] Model paths:', {
      embed: embedModelPath || null,
      chat: chatModelPath || null,
    });
  }
  if (!chatModelPath) {
    const packPath = packRootInDocuments?.trim()
      ? `${packRootInDocuments.replace(
          /\/+$/,
          '',
        )}/models/llm/${CHAT_MODEL_FILENAME}`
      : null;
    const appPath = modelsDir
      ? `${modelsDir.replace(/\/+$/, '')}/${CHAT_MODEL_FILENAME}`
      : null;
    console.warn(
      '[RAG] Chat model not found. Checked pack:',
      packPath,
      'files/models:',
      appPath,
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

export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  const [transcribedText, setTranscribedText] = useState('What is a trigger?');
  const [_partialText, setPartialText] = useState('');
  const [mode, setMode] = useState<NodeMapMode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [_voiceAvailable, setVoiceAvailable] = useState(false);
  const voiceRef = useRef<VoiceModule | null>(null);
  const ttsRef = useRef<TtsModule | null>(null);
  const committedTextRef = useRef('');
  const [piperAvailable, setPiperAvailable] = useState<boolean | null>(null);
  const [_piperDebugInfo, setPiperDebugInfo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [validationSummary, setValidationSummary] =
    useState<ValidationSummary | null>(null);
  const [packStatus, setPackStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [packError, setPackError] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(DEBUG_ENABLED_DEFAULT);
  const [debugShowZones, setDebugShowZones] = useState(false);
  const [panelRectsForDebug, setPanelRectsForDebug] = useState<NodeMapPanelRects>({});
  const [stateCycleOn, setStateCycleOn] = useState(false);
  const [revealedBlocks, setRevealedBlocks] = useState({
    answer: false,
    cards: false,
    rules: false,
    sources: false,
  });
  const nodeMapRef = useRef(createDefaultNodeMapRef());
  const recordingSessionIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const modeRef = useRef(mode);
  const stateCycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const stateCycleIdxRef = useRef(0);
  const userModeLongPressActiveRef = useRef(false);
  const lastTapAtRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackInterruptedRef = useRef(false);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const askHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ASK_HOLD_MS = 400;
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

  const isAsking = mode === 'processing';

  const { setSignals, emitEvent } = useAiVizBridge(nodeMapRef);
  const scrollYRef = useRef(0);
  const panelRectsContentRef = useRef<NodeMapPanelRects>({});

  const flushPanelRects = useCallback(() => {
    const next: NodeMapPanelRects = {};
    const source = panelRectsContentRef.current;
    const keys: Array<keyof NodeMapPanelRects> = ['answer', 'cards', 'rules'];
    for (const key of keys) {
      const rect = source[key];
      if (!rect) continue;
      if (rect.w <= 0 || rect.h <= 0) continue;
      next[key] = {
        x: rect.x,
        y: rect.y - scrollYRef.current,
        w: rect.w,
        h: rect.h,
      };
    }
    setSignals({ panelRects: next });
  }, [setSignals]);

  const updatePanelRect = useCallback(
    (key: keyof NodeMapPanelRects, rect: { x: number; y: number; w: number; h: number }) => {
      panelRectsContentRef.current = {
        ...panelRectsContentRef.current,
        [key]: rect,
      };
      flushPanelRects();
      if (debugShowZones) {
        setPanelRectsForDebug((prev) => ({
          ...prev,
          [key]: { ...rect, y: rect.y - scrollYRef.current },
        }));
      }
    },
    [flushPanelRects, debugShowZones],
  );

  const clearPanelRect = useCallback(
    (key: keyof NodeMapPanelRects) => {
      const next = { ...panelRectsContentRef.current };
      delete next[key];
      panelRectsContentRef.current = next;
      flushPanelRects();
    },
    [flushPanelRects],
  );

  const handleOverlayScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = e.nativeEvent.contentOffset.y;
      flushPanelRects();
    },
    [flushPanelRects],
  );

  useEffect(() => {
    if (DEBUG_SCENARIO) {
      setSignals(dummySignals);
    }
  }, [setSignals]);

  useEffect(() => {
    if (DEBUG_SCENARIO) {
      setSignals(dummySignals);
      return;
    }
    const phase =
      mode === 'processing'
        ? 'processing'
        : mode === 'speaking'
        ? 'resolved'
        : 'idle';
    const grounded =
      validationSummary != null
        ? validationSummary.stats.unknownCardCount === 0 &&
          validationSummary.stats.invalidRuleCount === 0
        : true;
    const confidence = grounded ? 0.9 : 0.5;
    const retrievalDepth =
      phase === 'processing' ? 0 : (validationSummary?.rules?.length ?? 0);
    const cardRefsCount =
      phase === 'processing' ? 0 : (validationSummary?.cards?.length ?? 0);
    setSignals({
      phase,
      grounded,
      confidence,
      retrievalDepth,
      cardRefsCount,
    });
  }, [mode, validationSummary, setSignals]);
  // Note: targetActivity/activity are set inside applySignalsToNodeMap from phase; no direct nodeMapRef write here.

  useEffect(() => {
    const setReduceMotion = (enabled: boolean) => {
      if (nodeMapRef.current) nodeMapRef.current.reduceMotion = enabled;
    };
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => sub?.remove?.();
  }, []);

  // Copy bundled content_pack to app files on startup so models are on device before first RAG use.
  useEffect(() => {
    copyBundlePackToDocuments().catch(() => {});
  }, []);

  // Copy Piper ONNX model from app assets to files/piper/ on startup (Android) so TTS works.
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
            path && console.log('[Piper] Model copied to', path),
        )
        .catch((e: unknown) =>
          console.warn(
            '[Piper] copyModelToFiles failed:',
            e instanceof Error ? e.message : e,
          ),
        );
    };
    run();
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, []);

  const theme = getTheme(isDarkMode);
  const textColor = theme.text;
  const mutedColor = theme.textMuted;
  const inputBg = theme.surface;
  const borderColor = theme.border;

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
    (fn: (v: ReturnType<typeof createDefaultNodeMapRef>) => void) => {
      const v = nodeMapRef.current;
      if (!v) return;
      fn(v);
    },
    [],
  );

  const applyVizState = useCallback(
    (state: NodeMapMode) => {
      setMode(state);
      if (state === 'released') {
        triggerPulseAtCenter(nodeMapRef);
      }
    },
    [],
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

  // Check Piper TTS availability with retries. Startup copy (model + espeak) may complete after first render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const PiperTts = require('piper-tts').default;
      const retryDelaysMs = [0, 800, 1500, 2500, 4000];
      for (const delay of retryDelaysMs) {
        if (cancelled) return;
        if (delay > 0)
          await new Promise<void>(resolve =>
            setTimeout(() => resolve(), delay),
          );
        try {
          const available = await PiperTts.isModelAvailable();
          if (cancelled) return;
          setPiperAvailable(available);
          if (available) {
            setPiperDebugInfo(null);
            return;
          }
        } catch {
          if (cancelled) return;
          setPiperAvailable(false);
        }
      }
      if (!cancelled && PiperTts.getDebugInfo) {
        try {
          const info = await PiperTts.getDebugInfo();
          if (!cancelled) setPiperDebugInfo(info ?? null);
        } catch {
          if (!cancelled) setPiperDebugInfo(null);
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
      triggerPulseAtCenter(nodeMapRef);
    };
    V.onSpeechPartialResults = e => {
      if (modeRef.current !== 'listening') return;
      setPartialText(e.value?.[0] ?? '');
      triggerPulseAtCenter(nodeMapRef);
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
    if (DEBUG_SCENARIO) {
      setSignals(dummySignals);
      setMode('idle');
      return null;
    }
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
        // Always run copy so native can recopy when bundle has models but Documents pack doesn't (e.g. after upgrading APK).
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
        console.log('[RAG] Pack root:', packRoot || '(bundle)');
        const embedModelId = await getPackEmbedModelId(reader);
        const { embedModelPath, chatModelPath } = await getOnDeviceModelPaths(
          packRoot || undefined,
        );
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
      emitEvent('chunkAccepted');
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
      let displayMsg = code ? `[${code}] ${msg}` : msg;
      if (code === 'E_MODEL_PATH' && Platform.OS === 'android') {
        displayMsg += ` Put the chat GGUF in the app's files/models/ folder (filename: ${CHAT_MODEL_FILENAME}). See docs/RAG_MODELS.md or use adb with run-as to push the file.`;
      }
      setError(displayMsg);
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
  }, [transcribedText, setSignals, emitEvent]);

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
      // Prefer Piper (offline). Re-check availability right before speak because startup copy may finish after mount.
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
          try {
            if (typeof Tts.removeEventListener === 'function') {
              Tts.removeEventListener('tts-finish', onFinish);
              Tts.removeEventListener('tts-cancel', onFinish);
            } else if (
              typeof (
                Tts as unknown as {
                  removeListener?: (e: string, f: () => void) => void;
                }
              ).removeListener === 'function'
            ) {
              (
                Tts as unknown as {
                  removeListener: (e: string, f: () => void) => void;
                }
              ).removeListener('tts-finish', onFinish);
              (
                Tts as unknown as {
                  removeListener: (e: string, f: () => void) => void;
                }
              ).removeListener('tts-cancel', onFinish);
            }
          } catch (_) {
            // react-native-tts on Android may not implement removeEventListener consistently
          }
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

  const handleAskPressIn = useCallback(() => {
    if (askHoldTimerRef.current) clearTimeout(askHoldTimerRef.current);
    askHoldTimerRef.current = setTimeout(() => {
      askHoldTimerRef.current = null;
      handleUserModeLongPressStart();
    }, ASK_HOLD_MS);
  }, [handleUserModeLongPressStart]);

  const handleAskPressOut = useCallback(() => {
    if (userModeLongPressActiveRef.current) {
      handleUserModeLongPressEnd();
    } else if (askHoldTimerRef.current) {
      clearTimeout(askHoldTimerRef.current);
      askHoldTimerRef.current = null;
    }
  }, [handleUserModeLongPressEnd]);

  const showContentPanels =
    mode !== 'idle' ||
    responseText != null ||
    validationSummary != null ||
    error != null;
  const cardsCount = DEBUG_SCENARIO
    ? dummyCards.length
    : (validationSummary?.cards?.length ?? 0);
  const rulesCount = DEBUG_SCENARIO
    ? dummyRules.length
    : (validationSummary?.rules?.length ?? 0);
  const sourcesCount = DEBUG_SCENARIO
    ? dummyRules.length + dummyCards.length
    : ((validationSummary?.rules?.length ?? 0) +
      (validationSummary?.cards?.length ?? 0));
  const canRevealPanels = DEBUG_SCENARIO || showContentPanels;
  const anyPanelVisible =
    revealedBlocks.answer ||
    revealedBlocks.cards ||
    revealedBlocks.rules ||
    revealedBlocks.sources;

  const revealBlock = useCallback(
    (key: 'answer' | 'cards' | 'rules' | 'sources') => {
      setRevealedBlocks(prev => ({ ...prev, [key]: true }));
    },
    [],
  );
  const handleClusterTap = useCallback(
    (cluster: 'rules' | 'cards') => {
      if (cluster === 'rules') {
        setRevealedBlocks({
          answer: true,
          cards: false,
          rules: true,
          sources: false,
        });
        emitEvent('tapCitation');
      } else {
        setRevealedBlocks({
          answer: true,
          cards: true,
          rules: false,
          sources: false,
        });
        emitEvent('tapCard');
      }
    },
    [emitEvent],
  );

  useEffect(() => {
    if (!canRevealPanels) {
      setRevealedBlocks({
        answer: false,
        cards: false,
        rules: false,
        sources: false,
      });
      return;
    }
    // Keep answer visible once user starts asking/seeing results in non-debug mode.
    if (!DEBUG_SCENARIO && showContentPanels) {
      setRevealedBlocks(prev => ({ ...prev, answer: true }));
    }
  }, [canRevealPanels, showContentPanels]);

  useEffect(() => {
    if (cardsCount === 0 || !revealedBlocks.cards) clearPanelRect('cards');
    if (rulesCount === 0 || !revealedBlocks.rules) clearPanelRect('rules');
    if (!canRevealPanels || !revealedBlocks.answer) clearPanelRect('answer');
  }, [
    cardsCount,
    rulesCount,
    canRevealPanels,
    revealedBlocks.answer,
    revealedBlocks.cards,
    revealedBlocks.rules,
    clearPanelRect,
  ]);

  if (!voiceReady && !error) {
    return <VoiceLoadingView theme={theme} paddingTop={insets.top} />;
  }

  return (
    <View style={styles.screenWrapper}>
      <NodeMapSurface
        nodeMapRef={nodeMapRef}
        controlsEnabled={debugEnabled}
        inputEnabled
        clusterZoneHighlights={!debugEnabled && !anyPanelVisible}
        canvasBackground={theme.viz.canvasBackground}
        onShortTap={!debugEnabled ? handleUserModeTap : undefined}
        onLongPressStart={
          !debugEnabled ? handleUserModeLongPressStart : undefined
        }
        onLongPressEnd={!debugEnabled ? handleUserModeLongPressEnd : undefined}
        onClusterTap={!debugEnabled ? handleClusterTap : undefined}
      >
        <UserVoiceView
          contentPaddingTop={insets.top}
          contentPaddingBottom={insets.bottom}
          onScroll={handleOverlayScroll}
        >
          <View style={[styles.container, styles.scrollOverlay]}>
            <View style={styles.askTriggerRow}>
              <Pressable
                style={[styles.askTrigger, { borderColor, backgroundColor: inputBg }]}
                onPressIn={handleAskPressIn}
                onPressOut={handleAskPressOut}
                onPress={handleUserModeTap}
              >
                <Text style={[styles.askTriggerLabel, { color: textColor }]}>
                  Hold to speak, release to ask
                </Text>
                <Text style={[styles.askTriggerHint, { color: mutedColor }]}>
                  Tap to play answer or cancel
                </Text>
              </Pressable>
            </View>
            {(DEBUG_SCENARIO || showContentPanels) ? (
            <View style={styles.contentStack}>
              {SHOW_REVEAL_CHIPS && (
              <View style={styles.revealDock}>
                {!revealedBlocks.answer && (
                  <Pressable
                    style={[styles.revealChip, { borderColor }]}
                    onPress={() => revealBlock('answer')}
                  >
                    <Text style={[styles.revealChipLabel, { color: textColor }]}>
                      Reveal Answer
                    </Text>
                  </Pressable>
                )}
                {!revealedBlocks.cards && cardsCount > 0 && (
                  <Pressable
                    style={[styles.revealChip, { borderColor }]}
                    onPress={() => revealBlock('cards')}
                  >
                    <Text style={[styles.revealChipLabel, { color: textColor }]}>
                      Reveal Cards
                    </Text>
                  </Pressable>
                )}
                {!revealedBlocks.rules && rulesCount > 0 && (
                  <Pressable
                    style={[styles.revealChip, { borderColor }]}
                    onPress={() => revealBlock('rules')}
                  >
                    <Text style={[styles.revealChipLabel, { color: textColor }]}>
                      Reveal Rules
                    </Text>
                  </Pressable>
                )}
                {!revealedBlocks.sources && sourcesCount > 0 && (
                  <Pressable
                    style={[styles.revealChip, { borderColor }]}
                    onPress={() => revealBlock('sources')}
                  >
                    <Text style={[styles.revealChipLabel, { color: textColor }]}>
                      Reveal Sources
                    </Text>
                  </Pressable>
                )}
              </View>
              )}
              {DEBUG_SCENARIO ? (
                <>
                  {revealedBlocks.answer && (
                  <DeconPanel
                    title="Answer"
                    subtitle="Grounded response"
                    variant="answer"
                    intensity={nodeMapRef.current?.vizIntensity ?? 'subtle'}
                    reduceMotion={nodeMapRef.current?.reduceMotion ?? false}
                    headerDecon={false}
                    ink={textColor}
                    mutedInk={mutedColor}
                    panelFill={theme.background}
                    panelStroke={borderColor}
                    accentIntrusionA={theme.primary}
                    warn={theme.warning}
                    onRect={rect => updatePanelRect('answer', rect)}
                    dismissible
                    onDismiss={() =>
                      setRevealedBlocks(prev => ({ ...prev, answer: false }))
                    }
                  >
                    <Text style={[styles.responseText, { color: textColor }]} selectable>
                      {dummyAnswer}
                    </Text>
                  </DeconPanel>
                  )}
                  {dummyCards.length > 0 && revealedBlocks.cards && (
                    <CardReferenceBlock
                      cards={dummyCards}
                      intensity={nodeMapRef.current?.vizIntensity ?? 'subtle'}
                      reduceMotion={nodeMapRef.current?.reduceMotion ?? false}
                      onCardPress={() => {
                        revealBlock('cards');
                        emitEvent('tapCard');
                      }}
                      ink={textColor}
                      mutedInk={mutedColor}
                      panelFill={theme.background}
                      panelStroke={borderColor}
                      accentIntrusionA={theme.primary}
                      warn={theme.warning}
                      onRect={rect => updatePanelRect('cards', rect)}
                      dismissible
                      onDismiss={() =>
                        setRevealedBlocks(prev => ({ ...prev, cards: false }))
                      }
                    />
                  )}
                  {dummyRules.length > 0 && revealedBlocks.rules && (
                    <SelectedRulesBlock
                      rules={dummyRules}
                      intensity={nodeMapRef.current?.vizIntensity ?? 'subtle'}
                      reduceMotion={nodeMapRef.current?.reduceMotion ?? false}
                      onRulePress={() => {
                        revealBlock('rules');
                        emitEvent('tapCitation');
                      }}
                      ink={textColor}
                      mutedInk={mutedColor}
                      panelFill={theme.background}
                      panelStroke={borderColor}
                      accentIntrusionA={theme.primary}
                      warn={theme.warning}
                      onRect={rect => updatePanelRect('rules', rect)}
                      dismissible
                      onDismiss={() =>
                        setRevealedBlocks(prev => ({ ...prev, rules: false }))
                      }
                    />
                  )}
                  {revealedBlocks.sources && (
                    <DeconPanel
                      title="Sources"
                      subtitle="Auditable context summary"
                      variant="neutral"
                      intensity={nodeMapRef.current?.vizIntensity ?? 'subtle'}
                      reduceMotion={nodeMapRef.current?.reduceMotion ?? false}
                      headerDecon
                      ink={textColor}
                      mutedInk={mutedColor}
                      panelFill={theme.background}
                      panelStroke={borderColor}
                      accentIntrusionA={theme.primary}
                      warn={theme.warning}
                      dismissible
                      onDismiss={() =>
                        setRevealedBlocks(prev => ({ ...prev, sources: false }))
                      }
                    >
                      <Text style={[styles.responseText, { color: textColor }]}>
                        {dummyRules.length} rule snippet(s), {dummyCards.length} card reference(s).
                      </Text>
                    </DeconPanel>
                  )}
                </>
              ) : (
                <>
                  {error ? (
                    <DeconPanel
                      title="Input Error"
                      subtitle="Please retry"
                      variant="warning"
                      intensity={nodeMapRef.current?.vizIntensity ?? 'subtle'}
                      reduceMotion={nodeMapRef.current?.reduceMotion ?? false}
                      headerDecon={false}
                      ink={textColor}
                      mutedInk={mutedColor}
                      panelFill={theme.background}
                      panelStroke={borderColor}
                      accentIntrusionA={theme.primary}
                      warn={theme.warning}
                    >
                      <Text style={styles.errorText}>{error}</Text>
                    </DeconPanel>
                  ) : null}

                  {revealedBlocks.answer && (
                  <DeconPanel
                    title="Answer"
                    subtitle="Grounded response"
                    variant={
                      validationSummary &&
                      (validationSummary.stats.unknownCardCount > 0 ||
                        validationSummary.stats.invalidRuleCount > 0)
                        ? 'warning'
                        : 'answer'
                    }
                    intensity={nodeMapRef.current?.vizIntensity ?? 'subtle'}
                    reduceMotion={nodeMapRef.current?.reduceMotion ?? false}
                    headerDecon={false}
                    ink={textColor}
                    mutedInk={mutedColor}
                    panelFill={theme.background}
                    panelStroke={borderColor}
                    accentIntrusionA={theme.primary}
                    warn={theme.warning}
                    onRect={rect => updatePanelRect('answer', rect)}
                    dismissible
                    onDismiss={() =>
                      setRevealedBlocks(prev => ({ ...prev, answer: false }))
                    }
                  >
                    {isAsking ? (
                      <View style={styles.responseLoadingRow}>
                        <ActivityIndicator size="small" color={textColor} />
                        <Text style={[styles.responseLabelInline, { color: mutedColor }]}>
                          Loading…
                        </Text>
                      </View>
                    ) : responseText != null ? (
                      <>
                        <Text style={[styles.responseText, { color: textColor }]} selectable>
                          {responseText}
                        </Text>
                        {validationSummary &&
                        (validationSummary.stats.unknownCardCount > 0 ||
                          validationSummary.stats.invalidRuleCount > 0) ? (
                          <Text style={[styles.validationHint, { color: mutedColor }]}>
                            Corrected {validationSummary.stats.unknownCardCount} name(s),{' '}
                            {validationSummary.stats.invalidRuleCount} rule(s) invalid.
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={[styles.responsePlaceholder, { color: mutedColor }]}>
                        Submit a question to see the answer here.
                      </Text>
                    )}
                  </DeconPanel>
                  )}

                  {revealedBlocks.cards && (
                  <CardReferenceBlock
                    cards={
                      validationSummary?.cards?.map(c => ({
                        id: c.doc_id ?? c.raw,
                        name: c.canonical ?? c.raw,
                        imageUri: null,
                      })) ?? []
                    }
                    intensity={nodeMapRef.current?.vizIntensity ?? 'subtle'}
                    reduceMotion={nodeMapRef.current?.reduceMotion ?? false}
                    onCardPress={() => {
                      revealBlock('cards');
                      emitEvent('tapCard');
                    }}
                    ink={textColor}
                    mutedInk={mutedColor}
                    panelFill={theme.background}
                    panelStroke={borderColor}
                    accentIntrusionA={theme.primary}
                    warn={theme.warning}
                    onRect={rect => updatePanelRect('cards', rect)}
                    dismissible
                    onDismiss={() =>
                      setRevealedBlocks(prev => ({ ...prev, cards: false }))
                    }
                  />
                  )}
                  {revealedBlocks.rules && (
                  <SelectedRulesBlock
                    rules={
                      validationSummary?.rules?.map(r => ({
                        id: r.canonical ?? r.raw,
                        title: r.raw,
                        excerpt: r.raw.length > 160 ? r.raw.slice(0, 160) + '…' : r.raw,
                        used: r.status === 'valid',
                      })) ?? []
                    }
                    intensity={nodeMapRef.current?.vizIntensity ?? 'subtle'}
                    reduceMotion={nodeMapRef.current?.reduceMotion ?? false}
                    onRulePress={() => {
                      revealBlock('rules');
                      emitEvent('tapCitation');
                    }}
                    ink={textColor}
                    mutedInk={mutedColor}
                    panelFill={theme.background}
                    panelStroke={borderColor}
                    accentIntrusionA={theme.primary}
                    warn={theme.warning}
                    onRect={rect => updatePanelRect('rules', rect)}
                    dismissible
                    onDismiss={() =>
                      setRevealedBlocks(prev => ({ ...prev, rules: false }))
                    }
                  />
                  )}
                  {validationSummary && revealedBlocks.sources ? (
                    <DeconPanel
                      title="Sources"
                      subtitle="Auditable context summary"
                      variant="neutral"
                      intensity={nodeMapRef.current?.vizIntensity ?? 'subtle'}
                      reduceMotion={nodeMapRef.current?.reduceMotion ?? false}
                      headerDecon
                      ink={textColor}
                      mutedInk={mutedColor}
                      panelFill={theme.background}
                      panelStroke={borderColor}
                      accentIntrusionA={theme.primary}
                      warn={theme.warning}
                      dismissible
                      onDismiss={() =>
                        setRevealedBlocks(prev => ({ ...prev, sources: false }))
                      }
                    >
                      <Text style={[styles.responseText, { color: textColor }]}>
                        {validationSummary.rules.length} rule snippet(s),{' '}
                        {validationSummary.cards.length} card reference(s).
                      </Text>
                    </DeconPanel>
                  ) : null}
                </>
              )}
            </View>
            ) : null}
          </View>
        </UserVoiceView>
      </NodeMapSurface>
      <NodeMapInteractionBand
        nodeMapRef={nodeMapRef}
        onClusterTap={handleClusterTap}
        enabled={!debugEnabled && !anyPanelVisible}
      />
      <DebugZoneOverlay panelRects={panelRectsForDebug} visible={debugShowZones} />
      {debugEnabled && (
        <DevScreen
          nodeMapRef={nodeMapRef}
          onClose={() => setDebugEnabled(false)}
          theme={{
            text: textColor,
            textMuted: mutedColor,
            background: inputBg,
          }}
        />
      )}
      <Pressable
        style={[styles.devToggle, { bottom: (insets.bottom || 16) + 92 }]}
        hitSlop={10}
        onPress={() => setDebugEnabled(prev => !prev)}
      >
        <Text style={styles.devToggleLabel}>
          {debugEnabled ? 'User' : 'Dev'}
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
  contentStack: {
    gap: 16,
    marginBottom: 8,
  },
  revealDock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  revealChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  revealChipLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  askTriggerRow: {
    marginBottom: 16,
  },
  askTrigger: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  askTriggerLabel: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  askTriggerHint: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    fontWeight: '500',
  },
  debugLayer: {
    zIndex: 3,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  debugScroll: {
    flex: 1,
  },
  debugScrollContent: {
    paddingHorizontal: 16,
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
    fontSize: 15,
    lineHeight: 22,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  partialHint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 8,
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
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  playbackHint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
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
    fontSize: 15,
    lineHeight: 22,
  },
  responsePlaceholder: {
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  validationHint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 8,
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
    zIndex: 5,
    elevation: 5,
  },
  devToggleLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
