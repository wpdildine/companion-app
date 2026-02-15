/**
 * CompanionApp
 * @format
 * Voice: @react-native-voice/voice (lazy-loaded to avoid "runtime not ready" on RN 0.84)
 * TTS: react-native-tts (lazy-loaded)
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
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const [transcribedText, setTranscribedText] = useState('');
  const [partialText, setPartialText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const voiceRef = useRef<VoiceModule | null>(null);
  const ttsRef = useRef<TtsModule | null>(null);
  const committedTextRef = useRef('');
  const [isSpeaking, setIsSpeaking] = useState(false);

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

  // Attach event handlers when Voice is ready
  useEffect(() => {
    const V = voiceRef.current;
    if (!V) return;

    V.onSpeechResults = (e) => {
      const next = (e.value?.[0] ?? '').trim();
      setPartialText('');
      if (!next) return;
      const committed = committedTextRef.current.trim();
      setTranscribedText(committed ? `${committed} ${next}` : next);
    };
    V.onSpeechPartialResults = (e) => {
      setPartialText(e.value?.[0] ?? '');
    };
    V.onSpeechError = (e) => {
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
    if (!text) return;
    let Tts: TtsModule;
    try {
      Tts = require('react-native-tts').default as TtsModule;
      ttsRef.current = Tts;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TTS failed to load');
      return;
    }
    setError(null);
    try {
      await Tts.getInitStatus();
      if (Platform.OS === 'android') {
        Tts.stop(); // iOS stop() has a bridge bug (BOOL* arg), so only stop on Android
      }
      const onFinish = () => {
        setIsSpeaking(false);
        Tts.removeEventListener('tts-finish', onFinish);
        Tts.removeEventListener('tts-cancel', onFinish);
      };
      Tts.addEventListener('tts-finish', onFinish);
      Tts.addEventListener('tts-cancel', onFinish);
      setIsSpeaking(true);
      Tts.speak(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TTS playback failed');
      setIsSpeaking(false);
    }
  }, [partialText, transcribedText]);

  const displayText = partialText || transcribedText;

  if (!voiceReady && !error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: bgColor }]}>
        <Text style={[styles.title, { color: textColor }]}>Voice</Text>
        <ActivityIndicator size="large" color={isDarkMode ? '#78c2a9' : '#0a7ea4'} style={styles.loader} />
        <Text style={[styles.hint, { color: mutedColor }]}>Loading speech recognition…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: bgColor }]}>
      <Text style={[styles.title, { color: textColor }]}>Voice to text</Text>

      <View style={[styles.textBox, { backgroundColor: inputBg, borderColor }]}>
        <TextInput
          style={[styles.textInput, { color: textColor }]}
          placeholder="Tap the mic and speak..."
          placeholderTextColor={mutedColor}
          value={displayText}
          onChangeText={(t) => {
            if (!partialText) setTranscribedText(t);
          }}
          editable={!isListening}
          multiline
        />
        {partialText ? (
          <Text style={[styles.partialHint, { color: mutedColor }]}>Listening...</Text>
        ) : null}
        <Pressable
          style={[styles.playbackButton, { borderColor }]}
          onPress={handlePlayback}
          disabled={!displayText.trim() || isSpeaking}
        >
          {isSpeaking ? (
            <ActivityIndicator size="small" color={textColor} />
          ) : (
            <Text style={[styles.playbackLabel, { color: textColor }]}>▶ Playback</Text>
          )}
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

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
          <Text style={[styles.submitButtonLabel, { color: textColor }]}>Clear</Text>
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
  playbackLabel: {
    fontSize: 15,
    fontWeight: '600',
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
