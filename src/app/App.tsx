/**
 * CompanionApp
 * @format
 * Voice: @react-native-voice/voice (lazy-loaded to avoid "runtime not ready" on RN 0.84)
 * TTS: Piper (offline) as main voice; fallback to react-native-tts when model not installed
 */

import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { perfTrace } from '../shared/logging';
import { prewarmQuickSQLite } from '../rag/packDbRN';
import AgentSurface from './AgentSurface';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    perfTrace('AppBoot', 'app boot start');
    prewarmQuickSQLite();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <AgentSurface />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
