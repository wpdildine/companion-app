/**
 * CompanionApp
 * @format
 * Voice: @react-native-voice/voice (lazy-loaded to avoid "runtime not ready" on RN 0.84)
 * TTS: Piper (offline) as main voice; fallback to react-native-tts when model not installed
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
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
  const [transcribedText, setTranscribedText] = useState(
    "Hello, how are you doing today? I'm testing pacing, emphasis, and clarity. Please read this at a natural speed."
  );
  const [partialText, setPartialText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const voiceRef = useRef<VoiceModule | null>(null);
  const ttsRef = useRef<TtsModule | null>(null);
  const committedTextRef = useRef('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [piperAvailable, setPiperAvailable] = useState<boolean | null>(null);
  const [piperDebugInfo, setPiperDebugInfo] = useState<string | null>(null);

  const textColor = isDarkMode ? '#e5e5e5' : '#1a1a1a';
  const mutedColor = isDarkMode ? '#888' : '#666';
  const bgColor = isDarkMode ? '#1a1a1a' : '#f5f5f5';
  const inputBg = isDarkMode ? '#2a2a2a' : '#fff';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';

  // Lazy-load Voice only after mount so we don't touch native before runtime is ready (RN 0.84).
  // Do not mutate NativeModules (e.g. NativeModules.Voice = ...) — the bridge forbids inserting into the native module proxy.
  useEffect(() => {
    try {
      const { NativeModules } = require('react-native');
      const VoiceNative = NativeModules?.Voice ?? NativeModules?.RCTVoice ?? null;
      if (!VoiceNative) {
        setError('Speech recognition not available (native Voice module not linked).');
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
      const V = voiceRef.current;
      if (V) {
        V.destroy().then(() => V.removeAllListeners());
        voiceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    console.log('piperAvailable', piperAvailable);
    console.log('piperDebugInfo', piperDebugInfo);
  }, [piperAvailable, piperDebugInfo]);
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
      const next = (e.value?.[0] ?? '').trim();
      setPartialText('');
      if (!next) return;
      const committed = committedTextRef.current.trim();
      setTranscribedText(committed ? `${committed} ${next}` : next);
    };
    V.onSpeechPartialResults = e => {
      setPartialText(e.value?.[0] ?? '');
    };
    V.onSpeechError = e => {
      setError(e.error?.message ?? 'Speech recognition error');
      setIsListening(false);
    };
    V.onSpeechEnd = () => {
      setIsListening(false);
      setPartialText('');
    };

    return () => {
      V.onSpeechResults = null;
      V.onSpeechPartialResults = null;
      V.onSpeechError = null;
      V.onSpeechEnd = null;
    };
  }, [voiceReady]);

  const startListening = useCallback(async () => {
    const V = voiceRef.current;
    if (!V) return;
    setError(null);
    setPartialText('');
    committedTextRef.current = transcribedText;
    try {
      await V.start('en-US');
      setIsListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start voice');
      setIsListening(false);
    }
  }, [transcribedText]);

  const stopListening = useCallback(async () => {
    const V = voiceRef.current;
    if (V) {
      try {
        await V.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
    setPartialText('');
  }, []);

  const handleSubmit = useCallback(() => {
    const text = transcribedText.trim();
    if (text) {
      Alert.alert('Submitted', `Text: ${text}`, [{ text: 'OK' }]);
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
    console.log('[Playback] start', { piperAvailable, textLength: text.length });
    // Prefer Piper (offline) as the main TTS voice when the model is available
    if (piperAvailable) {
      const PiperTts = require('piper-tts').default;
      const options = { lengthScale: 1.08, noiseScale: 0.62, noiseW: 0.8, gainDb: 0, interSentenceSilenceMs: 250, interCommaSilenceMs: 125 };
      console.log('[Playback] Piper: setOptions before speak', options);
      PiperTts.setOptions(options);
      console.log('[Playback] Piper path: starting speak', { textLength: text.length, preview: text.slice(0, 40) });
      setIsSpeaking(true);
      try {
        console.log('[Playback] Piper: calling PiperTts.speak()…');
        await PiperTts.speak(text);
        console.log('[Playback] Piper: speak() resolved (playback finished)');
      } catch (e) {
        console.log('[Playback] Piper: speak() rejected', e);
        setError(e instanceof Error ? e.message : 'Piper playback failed');
      } finally {
        setIsSpeaking(false);
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
        setIsSpeaking(false);
        Tts.removeEventListener('tts-finish', onFinish);
        Tts.removeEventListener('tts-cancel', onFinish);
      };
      Tts.addEventListener('tts-finish', onFinish);
      Tts.addEventListener('tts-cancel', onFinish);
      setIsSpeaking(true);
      console.log('[Playback] system TTS: calling speak()');
      Tts.speak(text);
    } catch (e) {
      console.log('[Playback] system TTS error', e);
      setError(e instanceof Error ? e.message : 'TTS playback failed');
      setIsSpeaking(false);
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
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: bgColor,
        },
      ]}
    >
      <Text style={[styles.title, { color: textColor }]}>Voice to text</Text>

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

      <View style={[styles.textBox, { backgroundColor: inputBg, borderColor }]}>
        <TextInput
          style={[styles.textInput, { color: textColor }]}
          placeholder="Tap the mic and speak..."
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
            <View style={[styles.playbackButtonContent, styles.playbackSpeakingRow]}>
              <ActivityIndicator size="small" color={textColor} />
              <Text style={[styles.playbackHint, styles.playbackSpeakingHint, { color: mutedColor }]}>
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

      <View style={styles.buttons}>
        <Pressable
          style={[
            styles.button,
            styles.micButton,
            isListening && styles.micButtonActive,
            !voiceReady && styles.buttonDisabled,
          ]}
          onPress={isListening ? stopListening : startListening}
          disabled={!voiceReady || !voiceAvailable}
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
        >
          <Text style={styles.submitButtonLabel}>Submit</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});

export default App;
