/**
 * Earcon hooks for listening start/end. Called once per transition from AgentSurface.
 * Assets are available at assets/sound/earcon_in.wav (start) and assets/sound/earcon_out.wav (end).
 * Implementation uses expo-audio for playback; Expo is loaded only on first playback (not at module import).
 */

import type { AudioPlayer } from 'expo-audio';
import { logInfo, logWarn } from '../logging';

type EarconKind = 'start' | 'end';

type EarconPlayer = AudioPlayer;

const EARCON_MODULES: Record<EarconKind, number> = {
  start: require('../../../assets/sound/earcon_in.wav'),
  end: require('../../../assets/sound/earcon_out.wav'),
};

let expoAudioModule: typeof import('expo-audio') | null = null;
function getExpoAudio(): typeof import('expo-audio') {
  if (!expoAudioModule) {
    expoAudioModule = require('expo-audio') as typeof import('expo-audio');
  }
  return expoAudioModule;
}

let audioModePromise: Promise<void> | null = null;
let preparePromise: Promise<void> | null = null;
const players = new Map<EarconKind, EarconPlayer>();

async function ensureAudioMode(): Promise<void> {
  const { setAudioModeAsync } = getExpoAudio();
  if (!audioModePromise) {
    audioModePromise = setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      interruptionModeAndroid: 'duckOthers',
      shouldPlayInBackground: false,
    }).catch((error: unknown) => {
      audioModePromise = null;
      throw error;
    });
  }
  await audioModePromise;
}

async function getPlayer(kind: EarconKind): Promise<EarconPlayer> {
  const cached = players.get(kind);
  if (cached) return cached;
  const { createAudioPlayer } = getExpoAudio();
  const source = EARCON_MODULES[kind];
  const player = createAudioPlayer(source);
  player.volume = 1;
  player.loop = false;
  players.set(kind, player);
  return player;
}

/** Registers bundled earcon assets for playback; does not load expo-audio or configure audio session. */
export async function prepareEarcons(): Promise<void> {
  if (!preparePromise) {
    preparePromise = (async () => {
      try {
        if (
          typeof EARCON_MODULES.start !== 'number' ||
          typeof EARCON_MODULES.end !== 'number'
        ) {
          throw new Error('earcon asset module ids missing');
        }
        logInfo('Playback', 'earcon assets preloaded');
      } catch (error) {
        preparePromise = null;
        logWarn('Playback', 'earcon preload failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }
  await preparePromise;
}

function logPlaybackStatus(kind: EarconKind, player: EarconPlayer): void {
  const status = {
    playing: player.playing,
    isLoaded: player.isLoaded,
    playbackState: (player as { playbackState?: string }).playbackState,
    reasonForWaitingToPlay: (player as { reasonForWaitingToPlay?: string }).reasonForWaitingToPlay,
  };
  if (player.playing) {
    logInfo('Playback', 'earcon playback started', { kind, ...status });
  } else {
    logWarn('Playback', 'earcon playback did not start', { kind, ...status });
  }
}

function playEarcon(kind: EarconKind): void {
  logInfo('Playback', 'earcon playback requested', { kind });
  (async () => {
    try {
      await ensureAudioMode();
      const player = await getPlayer(kind);
      if (typeof player.seekTo === 'function') {
        await Promise.resolve(player.seekTo(0));
      }
      await Promise.resolve(player.play());
      setTimeout(() => logPlaybackStatus(kind, player), 120);
    } catch (error) {
      logWarn('Playback', 'earcon playback failed', {
        kind,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })().catch(() => {});
}

/** Play earcon when listening begins. Call once per transition. */
export function playListeningStartEarcon(): void {
  if (typeof globalThis !== 'undefined' && (globalThis as { __DISABLE_IOS_EARCON_START__?: boolean }).__DISABLE_IOS_EARCON_START__) {
    return;
  }
  playEarcon('start');
}

/** Play earcon when listening ends / submit begins. Call once per transition. */
export function playListeningEndEarcon(): void {
  playEarcon('end');
}

export function cleanupEarcons(): void {
  for (const player of players.values()) {
    try {
      if (typeof player.release === 'function') {
        player.release();
      }
    } catch {
      /* ignore */
    }
  }
  players.clear();
  audioModePromise = null;
  preparePromise = null;
  expoAudioModule = null;
}
