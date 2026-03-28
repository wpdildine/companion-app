/**
 * CompanionApp
 * @format
 * Voice: @react-native-voice/voice (lazy-loaded to avoid "runtime not ready" on RN 0.84)
 * TTS: Piper (offline) as main voice; fallback to react-native-tts when model not installed
 */

import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { logInfo } from '../shared/logging';
import AgentSurface from './AgentSurface';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

const styles = {
  root: { flex: 1 },
};

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    logInfo('AppBoot', 'application boot started');
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <AgentSurface />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
