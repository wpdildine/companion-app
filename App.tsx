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

// @react-native-voice/voice uses NativeEventEmitter in a way that triggers warnings on new arch (Fabric) when the native module doesn't expose addListener/removeListeners. Voice still works.
LogBox.ignoreLogs([
  'new NativeEventEmitter() was called with a non-null argument without the required `addListener` method',
  'new NativeEventEmitter() was called with a non-null argument without the required `removeListeners` method',
]);
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  createDefaultVizRef,
  DevPanel,
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

/** Resolves embed and chat model file paths for on-device RAG. Uses bundle paths when present in assets/content_pack/models/, else Documents/models with fallback filenames. Resolves each model independently so a pack with only LLM (no embed) still gets chat from bundle. */
async function getOnDeviceModelPaths(): Promise<{
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
      'and app models dir:',
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
  const [devEnabled, setDevEnabled] = useState(false);
  const vizRef = useRef(createDefaultVizRef());
  const recordingSessionIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const modeRef = useRef(mode);
  const pressStartedWhileListeningRef = useRef(false);
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
  }, [mode]);

  const textColor = isDarkMode ? '#e5e5e5' : '#1a1a1a';
  const mutedColor = isDarkMode ? '#888' : '#666';
  const bgColor = isDarkMode ? '#1a1a1a' : '#f5f5f5';
  const inputBg = isDarkMode ? '#2a2a2a' : '#fff';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';

  // Lazy-load Voice only after mount so we don't touch native before runtime is ready (RN 0.84).
  // Do not mutate NativeModules (e.g. NativeModules.Voice = ...) — the bridge forbids inserting into the native module proxy.
  useEffect(() => {
    try {
      const VoiceNative =
        NativeModules?.Voice ?? NativeModules?.RCTVoice ?? null;
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
      } catch {
        // ignore
      }
    }
    setMode('idle');
    setPartialText('');
  }, []);

  const startListening = useCallback(async () => {
    const V = voiceRef.current;
    if (!V) return;
    if (mode === 'processing' || mode === 'speaking') return;
    recordingSessionIdRef.current += 1;
    setError(null);
    setPartialText('');
    committedTextRef.current = transcribedText;
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    try {
      await V.start('en-US');
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
  }, [transcribedText, mode, stopListening, playListenIn]);

  // Stop listening when app goes to background so mic does not stay on.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' && modeRef.current === 'listening') {
        stopListening();
      }
    });
    return () => sub.remove();
  }, [stopListening]);

  const handleSubmit = useCallback(async () => {
    const question = transcribedText.trim().replace(/\s+/g, ' ');
    if (!question) return;
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
        const { embedModelPath, chatModelPath } = await getOnDeviceModelPaths();
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
      console.warn('[RAG] error requestId=', reqId, 'code=', code, 'message=', msg);
      setMode('idle');
    }
  }, [transcribedText]);

  const handleClear = useCallback(() => {
    setTranscribedText('');
    setPartialText('');
  }, []);

  const handlePlayback = useCallback(async () => {
    const text = (partialText || transcribedText).trim();
    if (!text) {
      console.log('[Playback] no text, skipping');
      return;
    }
    setError(null);
    console.log('[Playback] start', {
      piperAvailable,
      textLength: text.length,
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
        textLength: text.length,
        preview: text.slice(0, 40),
      });
      setMode('speaking');
      try {
        console.log('[Playback] Piper: calling PiperTts.speak()…');
        await PiperTts.speak(text);
        console.log('[Playback] Piper: speak() resolved (playback finished)');
      } catch (e) {
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
      Tts.speak(text);
    } catch (e) {
      console.log('[Playback] system TTS error', e);
      setError(e instanceof Error ? e.message : 'TTS playback failed');
      setMode('idle');
    }
  }, [partialText, transcribedText, piperAvailable]);

  const displayText = partialText || transcribedText;

  if (!voiceReady && !error) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, backgroundColor: bgColor },
        ]}
      >
        <Text style={[styles.title, { color: textColor }]}>Voice</Text>
        <ActivityIndicator
          size="large"
          color={isDarkMode ? '#78c2a9' : '#0a7ea4'}
          style={styles.loader}
        />
        <Text style={[styles.hint, { color: mutedColor }]}>
          Loading speech recognition…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screenWrapper}>
      <NodeMapCanvas vizRef={vizRef} />
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
          <Pressable
            onLongPress={() => setDevEnabled(prev => !prev)}
            delayLongPress={600}
          >
            <Text style={[styles.title, { color: textColor }]}>Voice to text</Text>
          </Pressable>

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
          <Text style={[styles.piperStatusValue, styles.piperStatusMissing]}>
            Not found — run: pnpm run download-piper then rebuild (ios/android).
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

      <Text style={[styles.sectionLabel, { color: mutedColor }]}>Question</Text>
      <View style={[styles.textBox, { backgroundColor: inputBg, borderColor }]}>
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
              style={[styles.playbackButtonContent, styles.playbackSpeakingRow]}
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

      <Text style={[styles.sectionLabel, { color: mutedColor }]}>Response</Text>
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
        </View>
      )}

      <View style={styles.buttons}>
        <Pressable
          style={[
            styles.button,
            styles.micButton,
            isListening && styles.micButtonActive,
            !voiceReady && styles.buttonDisabled,
          ]}
          onPressIn={() => {
            pressStartedWhileListeningRef.current = modeRef.current === 'listening';
            setMode('touched');
            vizRef.current.touchActive = true;
            vizRef.current.touchWorld = [0, 0, 0];
          }}
          onPressOut={() => {
            vizRef.current.touchActive = false;
            vizRef.current.touchWorld = null;
            setMode('released');
            if (pressStartedWhileListeningRef.current) {
              stopListening();
            } else {
              startListening();
            }
          }}
          disabled={!voiceReady || !voiceAvailable || isAsking || isSpeaking}
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
      {showDevScreen && devEnabled && (
        <DevPanel vizRef={vizRef} onClose={() => setDevEnabled(false)} />
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
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  loader: {
    marginTop: 24,
  },
  hint: {
    marginTop: 12,
    fontSize: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  piperStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 12,
  },
  piperStatusLabel: {
    fontSize: 14,
  },
  piperStatusValue: {
    fontSize: 14,
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
    fontSize: 14,
  },
  packStatusValue: {
    fontSize: 14,
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
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textBox: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 120,
    padding: 14,
    marginBottom: 12,
  },
  textInput: {
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  partialHint: {
    fontSize: 12,
    marginTop: 4,
  },
  playbackButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
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
    fontWeight: '600',
  },
  playbackHint: {
    fontSize: 11,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    marginBottom: 8,
  },
  responseBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  responseLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  responseLabel: {
    fontSize: 12,
    marginBottom: 6,
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
    marginTop: 8,
  },
  buttons: {
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
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
    fontSize: 17,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#22c55e',
    borderWidth: 1,
  },
  submitButtonLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
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
