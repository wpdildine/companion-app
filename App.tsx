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
  LayoutChangeEvent,
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

// Throttle ms: only notify parent at most this often during drag to avoid UI freeze
const SLIDER_THROTTLE_MS = 120;

// Simple slider built with View + touch so we don't depend on native Slider linking.
// Uses local state during drag and throttles parent onValueChange to avoid setState storm.
function SimpleSlider({
  value,
  onValueChange,
  minimumValue,
  maximumValue,
  step,
  minimumTrackTintColor,
  maximumTrackTintColor,
  thumbTintColor,
}: {
  value: number;
  onValueChange: (v: number) => void;
  minimumValue: number;
  maximumValue: number;
  step: number;
  minimumTrackTintColor: string;
  maximumTrackTintColor: string;
  thumbTintColor: string;
}) {
  const trackWidthRef = useRef(0);
  const lastParentCallRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastValueRef = useRef(value);
  const [liveValue, setLiveValue] = useState(value);

  const clamp = useCallback(
    (v: number) => {
      const stepped = Math.round((v - minimumValue) / step) * step + minimumValue;
      return Math.min(maximumValue, Math.max(minimumValue, stepped));
    },
    [minimumValue, maximumValue, step]
  );

  useEffect(() => {
    if (!isDraggingRef.current) setLiveValue(value);
  }, [value]);

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
  }, []);

  const commit = useCallback(
    (v: number, force: boolean) => {
      const now = Date.now();
      if (force || now - lastParentCallRef.current >= SLIDER_THROTTLE_MS) {
        lastParentCallRef.current = now;
        onValueChange(v);
      }
    },
    [onValueChange]
  );

  const onTouch = useCallback(
    (evt: { nativeEvent: { locationX?: number } }) => {
      const trackWidth = trackWidthRef.current;
      if (trackWidth <= 0) return;
      const x = Math.max(0, Math.min(trackWidth, evt.nativeEvent.locationX ?? 0));
      const fraction = x / trackWidth;
      const raw = minimumValue + fraction * (maximumValue - minimumValue);
      const v = clamp(raw);
      lastValueRef.current = v;
      setLiveValue(v);
      commit(v, false);
    },
    [minimumValue, maximumValue, clamp, commit]
  );

  const onResponderRelease = useCallback(() => {
    isDraggingRef.current = false;
    commit(lastValueRef.current, true);
  }, [commit]);

  const onResponderGrant = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const fraction = (liveValue - minimumValue) / (maximumValue - minimumValue);
  const percent = Math.max(0, Math.min(1, fraction)) * 100;
  const THUMB_SIZE = 24;

  return (
    <View
      style={styles.sliderTrackWrap}
      onLayout={onTrackLayout}
      onStartShouldSetResponder={() => true}
      onResponderGrant={onResponderGrant}
      onResponderMove={onTouch}
      onResponderRelease={onResponderRelease}
      onResponderTerminate={onResponderRelease}
    >
      <View style={[styles.sliderTrack, { backgroundColor: maximumTrackTintColor }]}>
        <View
          style={[
            styles.sliderFill,
            {
              width: `${percent}%`,
              backgroundColor: minimumTrackTintColor,
            },
          ]}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.sliderThumb,
          {
            left: `${percent}%`,
            marginLeft: -THUMB_SIZE / 2,
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: THUMB_SIZE / 2,
            backgroundColor: thumbTintColor,
          },
        ]}
      />
    </View>
  );
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
  // Longer phrase makes lengthScale/speed differences obvious; compare audioSampleCount in logs (e.g. lengthScale 0.30 vs 2.50).
  const [transcribedText, setTranscribedText] = useState(
    "Hello, how are you doing today? I'm testing pacing, emphasis, and clarity. Please read this at a natural speed."
  );
  const [partialText, setPartialText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const voiceRef = useRef<VoiceModule | null>(null);
  const ttsRef = useRef<TtsModule | null>(null);
  const committedTextRef = useRef('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [piperAvailable, setPiperAvailable] = useState<boolean | null>(null);
  const [piperDebugInfo, setPiperDebugInfo] = useState<string | null>(null);

  // Piper voice knobs (only used when piperAvailable); recommended defaults
  const [lengthScale, setLengthScale] = useState(1.08);
  const [noiseScale, setNoiseScale] = useState(0.62);
  const [noiseW, setNoiseW] = useState(0.8);
  const [gainDb, setGainDb] = useState(0);

  const textColor = isDarkMode ? '#e5e5e5' : '#1a1a1a';
  const mutedColor = isDarkMode ? '#888' : '#666';
  const bgColor = isDarkMode ? '#1a1a1a' : '#f5f5f5';
  const inputBg = isDarkMode ? '#2a2a2a' : '#fff';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';

  // Lazy-load Voice only after mount so we don't touch native before runtime is ready (RN 0.84)
  useEffect(() => {
    try {
      const Voice = require('@react-native-voice/voice').default as VoiceModule;
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
      const options = { lengthScale, noiseScale, noiseW, gainDb, interSentenceSilenceMs: 250 };
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
  }, [partialText, transcribedText, piperAvailable, lengthScale, noiseScale, noiseW, gainDb]);

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

      {piperAvailable === true ? (
        <View style={[styles.sliderSection, { backgroundColor: inputBg, borderColor }]}>
          <Text style={[styles.sliderSectionTitle, { color: textColor }]}>
            Voice settings
          </Text>
          <View style={styles.sliderRow}>
            <Text style={[styles.sliderLabel, { color: mutedColor }]}>
              Speed (length): {lengthScale.toFixed(2)}
            </Text>
            <SimpleSlider
              value={lengthScale}
              onValueChange={setLengthScale}
              minimumValue={0.7}
              maximumValue={1.4}
              step={0.01}
              minimumTrackTintColor={isDarkMode ? '#78c2a9' : '#0a7ea4'}
              maximumTrackTintColor={mutedColor}
              thumbTintColor={isDarkMode ? '#78c2a9' : '#0a7ea4'}
            />
          </View>
          <View style={styles.sliderRow}>
            <Text style={[styles.sliderLabel, { color: mutedColor }]}>
              Variation (noise): {noiseScale.toFixed(2)}
            </Text>
            <SimpleSlider
              value={noiseScale}
              onValueChange={setNoiseScale}
              minimumValue={0.4}
              maximumValue={0.9}
              step={0.01}
              minimumTrackTintColor={isDarkMode ? '#78c2a9' : '#0a7ea4'}
              maximumTrackTintColor={mutedColor}
              thumbTintColor={isDarkMode ? '#78c2a9' : '#0a7ea4'}
            />
          </View>
          <View style={styles.sliderRow}>
            <Text style={[styles.sliderLabel, { color: mutedColor }]}>
              Energy (noise W): {noiseW.toFixed(2)}
            </Text>
            <SimpleSlider
              value={noiseW}
              onValueChange={setNoiseW}
              minimumValue={0.5}
              maximumValue={1.1}
              step={0.01}
              minimumTrackTintColor={isDarkMode ? '#78c2a9' : '#0a7ea4'}
              maximumTrackTintColor={mutedColor}
              thumbTintColor={isDarkMode ? '#78c2a9' : '#0a7ea4'}
            />
          </View>
          <View style={styles.sliderRow}>
            <Text style={[styles.sliderLabel, { color: mutedColor }]}>
              Volume (dB): {gainDb.toFixed(1)}
            </Text>
            <SimpleSlider
              value={gainDb}
              onValueChange={setGainDb}
              minimumValue={-6}
              maximumValue={6}
              step={0.5}
              minimumTrackTintColor={isDarkMode ? '#78c2a9' : '#0a7ea4'}
              maximumTrackTintColor={mutedColor}
              thumbTintColor={isDarkMode ? '#78c2a9' : '#0a7ea4'}
            />
          </View>
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
          disabled={!voiceReady}
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
  sliderSection: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sliderSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  sliderRow: {
    marginBottom: 4,
  },
  sliderLabel: {
    fontSize: 13,
    marginBottom: 2,
  },
  sliderTrackWrap: {
    width: '100%',
    height: 36,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    top: (36 - 24) / 2,
  },
  slider: {
    width: '100%',
    height: 28,
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
