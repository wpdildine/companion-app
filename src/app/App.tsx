/**
 * CompanionApp
 * @format
 * Voice: @react-native-voice/voice (lazy-loaded to avoid "runtime not ready" on RN 0.84)
 * TTS: Piper (offline) as main voice; fallback to react-native-tts when model not installed
 */

import { useEffect } from 'react';
import {
  LogBox,
  StatusBar,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { logInfo } from '../shared/logging';
import AgentSurface from './AgentSurface';

// @react-native-voice/voice uses NativeEventEmitter in a way that triggers warnings on new arch (Fabric) when the native module doesn't expose addListener/removeListeners. Voice still works.
LogBox.ignoreLogs([
  'new NativeEventEmitter() was called with a non-null argument without the required `addListener` method',
  'new NativeEventEmitter() was called with a non-null argument without the required `removeListeners` method',
]);

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    logInfo('AppBoot', 'application boot started');
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AgentSurface />
    </SafeAreaProvider>
  );
}

export default App;
