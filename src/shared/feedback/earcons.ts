/**
 * Earcon hooks for listening start/end. Called once per transition from AgentSurface.
 * Assets are available at assets/sound/earcon_in.wav (start) and assets/sound/earcon_out.wav (end).
 * Implementation may load and play using whatever mechanism the platform supports.
 */

import { Asset } from 'expo-asset';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { logWarn } from '../logging';

type EarconKind = 'start' | 'end';

const EARCON_MODULES: Record<EarconKind, number> = {
  start: require('../../../assets/sound/earcon_in.wav'),
  end: require('../../../assets/sound/earcon_out.wav'),
};

let audioModePromise: Promise<void> | null = null;
const activeSounds = new Set<Audio.Sound>();
const unloadTimers = new Map<Audio.Sound, ReturnType<typeof setTimeout>>();

async function ensureAudioMode(): Promise<void> {
  if (!audioModePromise) {
    audioModePromise = Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    }).catch((error: unknown) => {
      audioModePromise = null;
      throw error;
    });
  }
  await audioModePromise;
}

function playEarcon(kind: EarconKind): void {
  (async () => {
    try {
      await ensureAudioMode();
      const asset = Asset.fromModule(EARCON_MODULES[kind]);
      if (!asset.localUri) {
        await asset.downloadAsync();
      }
      const source = asset.localUri ?? asset.uri;
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: source },
        { shouldPlay: true, isLooping: false, volume: 1 },
      );
      activeSounds.add(sound);
      const durationMs =
        status.isLoaded && typeof status.durationMillis === 'number'
          ? status.durationMillis
          : 800;
      const unloadTimer = setTimeout(() => {
        unloadTimers.delete(sound);
        activeSounds.delete(sound);
        sound.unloadAsync().catch(() => {});
      }, durationMs + 250);
      unloadTimers.set(sound, unloadTimer);
    } catch (error) {
      logWarn('Playback', 'Earcon playback failed', {
        kind,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })().catch(() => {});
}

/** Play earcon when listening begins. Call once per transition. */
export function playListeningStartEarcon(): void {
  playEarcon('start');
}

/** Play earcon when listening ends / submit begins. Call once per transition. */
export function playListeningEndEarcon(): void {
  playEarcon('end');
}

export function cleanupEarcons(): void {
  for (const timer of unloadTimers.values()) {
    clearTimeout(timer);
  }
  unloadTimers.clear();
  for (const sound of activeSounds) {
    sound.unloadAsync().catch(() => {});
  }
  activeSounds.clear();
}
