/**
 * CompanionApp
 * @format
 * Voice: @react-native-voice/voice (lazy-loaded to avoid "runtime not ready" on RN 0.84)
 * TTS: Piper (offline) as main voice; fallback to react-native-tts when model not installed
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar, useColorScheme, View } from 'react-native';
import BootSplash from 'react-native-bootsplash';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { logInfo } from '../shared/logging';
import AgentSurface from './AgentSurface';
import BootHandoffSurface from './BootHandoffSurface';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

const styles = {
  root: { flex: 1, backgroundColor: '#1a2332' as const },
};

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [bootPhase, setBootPhase] = useState<'boot' | 'ready'>('boot');
  const alreadyHiddenRef = useRef(false);

  useEffect(() => {
    logInfo('AppBoot', 'application boot started');
  }, []);

  const onSafeToReleaseNative = useCallback(async () => {
    if (alreadyHiddenRef.current) {
      return;
    }
    alreadyHiddenRef.current = true;
    await BootSplash.hide({ fade: true });
    setBootPhase('ready');
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        {bootPhase === 'boot' ? (
          <View style={styles.root}>
            <BootHandoffSurface onSafeToReleaseNative={onSafeToReleaseNative} />
          </View>
        ) : (
          <AgentSurface />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
