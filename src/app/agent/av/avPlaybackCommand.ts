/**
 * AV-owned playback command: provider probe, posture → Piper options, speak/stop I/O.
 * Emits observational `av.playback.*` facts via injected `emitFact`; does not commit orchestrator lifecycle.
 */

import { logError, logWarn } from '../../../shared/logging';
import type { AvFact } from './avFacts';
import {
  finishAvPlaybackLifecycleMechanics,
  selectAvPlaybackRouteMechanics,
  startAvPlaybackLifecycleMechanics,
  type AvPlaybackRoute,
} from './avSurface';

export type PlaybackPosture = 'default' | 'calm';

/** Maps declarative posture to Piper `setOptions` payload (mechanical; no semantics in orchestrator). */
export function mapPlaybackPostureToPiperOptions(
  posture: PlaybackPosture,
): {
  lengthScale: number;
  noiseScale: number;
  noiseW: number;
  gainDb: number;
  interSentenceSilenceMs: number;
  interCommaSilenceMs: number;
} {
  switch (posture) {
    case 'calm':
      return {
        lengthScale: 1.15,
        noiseScale: 0.55,
        noiseW: 0.72,
        gainDb: -2,
        interSentenceSilenceMs: 280,
        interCommaSilenceMs: 140,
      };
    case 'default':
    default:
      return {
        lengthScale: 1.08,
        noiseScale: 0.62,
        noiseW: 0.8,
        gainDb: 0,
        interSentenceSilenceMs: 250,
        interCommaSilenceMs: 125,
      };
  }
}

export type AvTtsModule = {
  getInitStatus: () => Promise<void>;
  speak: (text: string, options?: object) => void;
  stop: () => void;
  addEventListener: (event: string, handler: () => void) => void;
  removeEventListener?: (event: string, handler: () => void) => void;
};

export type AvPiperModule = {
  setOptions: (options?: Record<string, unknown> | null) => void;
  speak: (text: string) => Promise<void>;
  stop?: () => void;
  isModelAvailable?: () => Promise<boolean>;
};

type AvPlaybackLog = typeof sharedLogInfo;

export type AvPlaybackSpeakDeps = {
  emitFact: (fact: AvFact) => void;
  activePlaybackProviderRef: { current: AvPlaybackRoute | null };
  ttsModuleRef: { current: AvTtsModule | null };
  logInfo: AvPlaybackLog;
  isPlaybackHandoffLogEnabled: boolean;
  platformOs: string;
  playbackInflightAttemptIdRef: { current: number | null };
  attemptId: number;
  consumePlaybackTerminalSlot: (
    awaiting: { current: Set<number> },
    id: number,
  ) => boolean;
  playbackAwaitingTerminalRef: { current: Set<number> };
  isPlaybackInterrupted: () => boolean;
  readPiperErrorCode: (e: unknown) => string;
  setPiperAvailableFlag: (available: boolean) => void;
  piperAvailableCache: boolean | null;
};

export type AvPlaybackSpeakResult =
  | { kind: 'ok' }
  | { kind: 'fallback_tts_module_load_failed'; message: string }
  | { kind: 'fallback_tts_play_failed'; message: string };

function loadPiperDefault(): AvPiperModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('piper-tts').default as AvPiperModule;
}

/** Mechanical stop for Piper + last fallback `Tts` instance (orchestrator-owned ref). */
export function stopSpokenOutputEngines(ttsModuleRef: {
  current: AvTtsModule | null;
}): void {
  try {
    const P = loadPiperDefault();
    if (typeof P?.stop === 'function') P.stop();
  } catch {
    /* ignore */
  }
  try {
    ttsModuleRef.current?.stop();
  } catch {
    /* ignore */
  }
}

export async function runAvPlaybackSpeak(args: {
  text: string;
  boundRequestId: number | null;
  posture: PlaybackPosture;
  attemptId: number;
  deps: AvPlaybackSpeakDeps;
}): Promise<AvPlaybackSpeakResult> {
  const { text, boundRequestId, posture, attemptId, deps } = args;
  const PiperTts = loadPiperDefault();
  let canUsePiper = deps.piperAvailableCache;
  if (!canUsePiper && PiperTts?.isModelAvailable) {
    try {
      canUsePiper = !!(await PiperTts.isModelAvailable());
      deps.setPiperAvailableFlag(canUsePiper);
    } catch {
      canUsePiper = false;
    }
  }

  if (canUsePiper) {
    const playbackRoute = selectAvPlaybackRouteMechanics(true);
    deps.logInfo('Playback', 'tts path selected', {
      provider: 'piper',
      textChars: text.length,
      posture,
    });
    PiperTts.setOptions(mapPlaybackPostureToPiperOptions(posture));
    const speakPromise = PiperTts.speak(text);
    queueMicrotask(() => {
      if (deps.playbackInflightAttemptIdRef.current !== attemptId) return;
      const fact = startAvPlaybackLifecycleMechanics({
        provider: playbackRoute,
        playbackRequestId: boundRequestId,
        activePlaybackProviderRef: deps.activePlaybackProviderRef,
        isPlaybackHandoffLogEnabled: deps.isPlaybackHandoffLogEnabled,
        logInfo: deps.logInfo,
      });
      deps.emitFact(fact);
    });
    try {
      await speakPromise;
    } catch (e) {
      if (deps.playbackInflightAttemptIdRef.current !== attemptId) {
        return { kind: 'ok' };
      }
      if (
        !deps.consumePlaybackTerminalSlot(
          deps.playbackAwaitingTerminalRef,
          attemptId,
        )
      ) {
        return { kind: 'ok' };
      }
      const code = deps.readPiperErrorCode(e);
      if (deps.isPlaybackInterrupted() || code === 'E_CANCELLED') {
        const fact = finishAvPlaybackLifecycleMechanics({
          endedAt: Date.now(),
          playbackRequestId: boundRequestId,
          activePlaybackProviderRef: deps.activePlaybackProviderRef,
          event: 'cancelled',
        });
        deps.emitFact(fact);
      } else {
        const message =
          e instanceof Error ? e.message : 'Piper playback failed';
        logError('Playback', 'piper playback failed', {
          message,
          textChars: text.length,
        });
        const fact = finishAvPlaybackLifecycleMechanics({
          endedAt: Date.now(),
          playbackRequestId: boundRequestId,
          activePlaybackProviderRef: deps.activePlaybackProviderRef,
          event: 'failed',
          failureMessage: message,
        });
        deps.emitFact(fact);
      }
    } finally {
      const ttsEndedAt = Date.now();
      setTimeout(() => {
        if (deps.playbackInflightAttemptIdRef.current !== attemptId) return;
        if (
          !deps.consumePlaybackTerminalSlot(
            deps.playbackAwaitingTerminalRef,
            attemptId,
          )
        ) {
          return;
        }
        const fact = finishAvPlaybackLifecycleMechanics({
          endedAt: ttsEndedAt,
          playbackRequestId: boundRequestId,
          activePlaybackProviderRef: deps.activePlaybackProviderRef,
          event: 'completed',
        });
        deps.emitFact(fact);
      }, 0);
    }
    return { kind: 'ok' };
  }

  const playbackRoute = selectAvPlaybackRouteMechanics(false);
  logWarn('Playback', 'fallback tts: posture not mapped to engine params', {
    posture,
    provider: 'react-native-tts',
  });
  let Tts: AvTtsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Tts = require('react-native-tts').default as AvTtsModule;
    deps.ttsModuleRef.current = Tts;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'TTS failed to load';
    return { kind: 'fallback_tts_module_load_failed', message };
  }

  try {
    await Tts.getInitStatus();
    if (deps.platformOs === 'android') Tts.stop();
    deps.logInfo('Playback', 'tts path selected', {
      provider: 'react-native-tts',
      textChars: text.length,
    });
    const endFallbackPlayback = (fromCancelEvent: boolean) => {
      if (deps.playbackInflightAttemptIdRef.current !== attemptId) return;
      if (
        !deps.consumePlaybackTerminalSlot(
          deps.playbackAwaitingTerminalRef,
          attemptId,
        )
      ) {
        return;
      }
      const wantCancel = fromCancelEvent;
      const ttsEndedAt = Date.now();
      try {
        if (typeof Tts.removeEventListener === 'function') {
          Tts.removeEventListener('tts-finish', onFinishNatural);
          Tts.removeEventListener('tts-cancel', onFinishCancel);
        }
      } catch {
        /* ignore */
      }
      const fact = finishAvPlaybackLifecycleMechanics({
        endedAt: ttsEndedAt,
        playbackRequestId: boundRequestId,
        activePlaybackProviderRef: deps.activePlaybackProviderRef,
        event: wantCancel ? 'cancelled' : 'completed',
      });
      deps.emitFact(fact);
    };
    const onFinishNatural = () => endFallbackPlayback(false);
    const onFinishCancel = () => endFallbackPlayback(true);
    Tts.addEventListener('tts-finish', onFinishNatural);
    Tts.addEventListener('tts-cancel', onFinishCancel);
    const started = startAvPlaybackLifecycleMechanics({
      provider: playbackRoute,
      playbackRequestId: boundRequestId,
      activePlaybackProviderRef: deps.activePlaybackProviderRef,
      isPlaybackHandoffLogEnabled: deps.isPlaybackHandoffLogEnabled,
      logInfo: deps.logInfo,
    });
    deps.emitFact(started);
    Tts.speak(text);
    return { kind: 'ok' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'TTS playback failed';
    return { kind: 'fallback_tts_play_failed', message };
  }
}
