/**
 * AV-owned playback command: provider probe, posture → Piper options, speak/stop I/O.
 * Emits observational `av.playback.*` facts via injected `emitFact`; does not commit orchestrator lifecycle.
 */

import { logError, logInfo, logWarn } from '../../../shared/logging';
import type { AvFact } from './avFacts';
import {
  finishAvPlaybackLifecycleMechanics,
  selectAvPlaybackRouteMechanics,
  startAvPlaybackLifecycleMechanics,
  type AvPlaybackRoute,
} from './avSurface';

export type PlaybackPosture = 'default' | 'calm' | 'treated';

/** Debug-only partial render knobs; merged over treated preset in AV when posture is treated. */
export type TreatedDebugRenderOverrides = Partial<{
  renderPostGainDb: number;
  renderLeadSilenceMs: number;
  renderHighPassHz: number;
}>;

const PIPER_DEFAULT_SYNTH_OPTIONS = {
  lengthScale: 1.08,
  noiseScale: 0.62,
  noiseW: 0.8,
  gainDb: 0,
  interSentenceSilenceMs: 250,
  interCommaSilenceMs: 125,
} as const;

const PIPER_CALM_SYNTH_OPTIONS = {
  lengthScale: 1.15,
  noiseScale: 0.55,
  noiseW: 0.72,
  gainDb: -2,
  interSentenceSilenceMs: 280,
  interCommaSilenceMs: 140,
} as const;

/** Maps declarative posture to Piper `setOptions` payload (mechanical; no semantics in orchestrator). */
export function mapPlaybackPostureToPiperOptions(
  posture: PlaybackPosture,
): typeof PIPER_DEFAULT_SYNTH_OPTIONS &
  Partial<{
    renderPostGainDb: number;
    renderLeadSilenceMs: number;
    renderHighPassHz: number;
  }> {
  switch (posture) {
    case 'calm':
      return { ...PIPER_CALM_SYNTH_OPTIONS };
    case 'treated':
      return {
        ...PIPER_DEFAULT_SYNTH_OPTIONS,
        renderPostGainDb: -1,
        renderLeadSilenceMs: 40,
        renderHighPassHz: 80,
      };
    case 'default':
    default:
      return { ...PIPER_DEFAULT_SYNTH_OPTIONS };
  }
}

type PiperSpeakOptions = ReturnType<typeof mapPlaybackPostureToPiperOptions>;

/**
 * Piper `setOptions` payload: posture map, with optional debug-only shallow merge on treated only.
 * default/calm ignore `treatedDebugRenderOverrides` entirely.
 */
export function resolvePiperOptions(
  posture: PlaybackPosture,
  treatedDebugRenderOverrides?: TreatedDebugRenderOverrides,
): PiperSpeakOptions {
  const base = mapPlaybackPostureToPiperOptions(posture);
  if (posture !== 'treated' || !treatedDebugRenderOverrides) {
    return base;
  }
  const o = treatedDebugRenderOverrides;
  const out: PiperSpeakOptions = { ...base };
  if (typeof o.renderPostGainDb === 'number' && Number.isFinite(o.renderPostGainDb)) {
    out.renderPostGainDb = o.renderPostGainDb;
  }
  if (
    typeof o.renderLeadSilenceMs === 'number' &&
    Number.isFinite(o.renderLeadSilenceMs)
  ) {
    out.renderLeadSilenceMs = o.renderLeadSilenceMs;
  }
  if (typeof o.renderHighPassHz === 'number' && Number.isFinite(o.renderHighPassHz)) {
    out.renderHighPassHz = o.renderHighPassHz;
  }
  return out;
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

type AvPlaybackLog = typeof logInfo;

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
  /** Debug-only; applied only when posture is treated (see resolvePiperOptions). */
  treatedDebugRenderOverrides?: TreatedDebugRenderOverrides;
  deps: AvPlaybackSpeakDeps;
}): Promise<AvPlaybackSpeakResult> {
  const {
    text,
    boundRequestId,
    posture,
    attemptId,
    treatedDebugRenderOverrides,
    deps,
  } = args;
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
    PiperTts.setOptions(
      resolvePiperOptions(posture, treatedDebugRenderOverrides),
    );
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

  let fallbackPlaybackStartedEmitted = false;
  let onFinishNatural: () => void;
  let onFinishCancel: () => void;
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
    onFinishNatural = () => endFallbackPlayback(false);
    onFinishCancel = () => endFallbackPlayback(true);
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
    fallbackPlaybackStartedEmitted = true;
    Tts.speak(text);
    return { kind: 'ok' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'TTS playback failed';
    if (fallbackPlaybackStartedEmitted) {
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
      try {
        if (typeof Tts.removeEventListener === 'function') {
          Tts.removeEventListener('tts-finish', onFinishNatural);
          Tts.removeEventListener('tts-cancel', onFinishCancel);
        }
      } catch {
        /* ignore */
      }
      logError('Playback', 'tts playback failed', {
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
      return { kind: 'ok' };
    }
    return { kind: 'fallback_tts_play_failed', message };
  }
}
