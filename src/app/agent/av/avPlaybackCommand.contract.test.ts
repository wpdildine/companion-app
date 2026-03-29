jest.mock('piper-tts', () => ({
  __esModule: true,
  default: {
    isModelAvailable: jest.fn(() => Promise.resolve(false)),
    setOptions: jest.fn(),
    speak: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('react-native-tts', () => ({
  __esModule: true,
  default: {
    getInitStatus: jest.fn(() => Promise.resolve()),
    speak: jest.fn(),
    stop: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
}));

import {
  mapPlaybackPostureToPiperOptions,
  resolvePiperOptions,
  runAvPlaybackSpeak,
  type PlaybackPosture,
} from './avPlaybackCommand';
import type { AvFact } from './avFacts';
import { selectAvPlaybackRouteMechanics } from './avSurface';

function consumePlaybackTerminalSlot(
  awaiting: { current: Set<number> },
  attemptId: number,
): boolean {
  const s = awaiting.current;
  if (!s.has(attemptId)) return false;
  s.delete(attemptId);
  return true;
}

describe('avPlaybackCommand contract', () => {
  it('maps default posture to historical Piper parity literals', () => {
    expect(mapPlaybackPostureToPiperOptions('default')).toEqual({
      lengthScale: 1.08,
      noiseScale: 0.62,
      noiseW: 0.8,
      gainDb: 0,
      interSentenceSilenceMs: 250,
      interCommaSilenceMs: 125,
    });
  });

  it('maps calm posture to distinct mechanical tuning', () => {
    const calm = mapPlaybackPostureToPiperOptions('calm');
    const def = mapPlaybackPostureToPiperOptions('default');
    expect(calm).not.toEqual(def);
    expect(calm.lengthScale).toBeGreaterThan(def.lengthScale);
  });

  it('maps treated posture to default synth plus post-PCM render keys', () => {
    const treated = mapPlaybackPostureToPiperOptions('treated');
    const def = mapPlaybackPostureToPiperOptions('default');
    expect(treated).toEqual({
      ...def,
      renderPostGainDb: -1,
      renderLeadSilenceMs: 40,
      renderHighPassHz: 80,
    });
  });

  it('selectAvPlaybackRouteMechanics is pure capability routing', () => {
    expect(selectAvPlaybackRouteMechanics(true)).toBe('piper');
    expect(selectAvPlaybackRouteMechanics(false)).toBe('react-native-tts');
  });

  it('PlaybackPosture is a closed small union at compile time', () => {
    const p: PlaybackPosture = 'default';
    expect(p).toBe('default');
  });
});

describe('resolvePiperOptions treated debug overrides', () => {
  const bogus: { renderPostGainDb: number } = { renderPostGainDb: 99 };

  it('ignores override bag for default posture', () => {
    expect(resolvePiperOptions('default', bogus)).toEqual(
      mapPlaybackPostureToPiperOptions('default'),
    );
  });

  it('ignores override bag for calm posture', () => {
    expect(resolvePiperOptions('calm', bogus)).toEqual(
      mapPlaybackPostureToPiperOptions('calm'),
    );
  });

  it('treated with no overrides matches treated map', () => {
    expect(resolvePiperOptions('treated', undefined)).toEqual(
      mapPlaybackPostureToPiperOptions('treated'),
    );
  });

  it('treated shallow-merges partial overrides over treated defaults', () => {
    const base = mapPlaybackPostureToPiperOptions('treated');
    expect(resolvePiperOptions('treated', { renderPostGainDb: 2 })).toEqual({
      ...base,
      renderPostGainDb: 2,
    });
    expect(resolvePiperOptions('treated', { renderHighPassHz: 120 })).toEqual({
      ...base,
      renderHighPassHz: 120,
    });
  });

  it('ignores layer2 keys in override bag for default posture', () => {
    expect(
      resolvePiperOptions('default', {
        renderLayer2Enabled: true,
        renderLayer2DelayMs: 80,
        renderLayer2GainDb: -3,
      }),
    ).toEqual(mapPlaybackPostureToPiperOptions('default'));
  });

  it('treated shallow-merges layer2 overrides', () => {
    const base = mapPlaybackPostureToPiperOptions('treated');
    expect(
      resolvePiperOptions('treated', {
        renderLayer2Enabled: true,
        renderLayer2DelayMs: 50,
        renderLayer2GainDb: -6,
      }),
    ).toEqual({
      ...base,
      renderLayer2Enabled: true,
      renderLayer2DelayMs: 50,
      renderLayer2GainDb: -6,
    });
  });
});

describe('runAvPlaybackSpeak fallback terminal contract', () => {
  const piperTts = () =>
    require('piper-tts').default as {
      isModelAvailable: jest.Mock;
    };
  const rnTts = () =>
    require('react-native-tts').default as {
      getInitStatus: jest.Mock;
      speak: jest.Mock;
      addEventListener: jest.Mock;
      removeEventListener: jest.Mock;
    };

  beforeEach(() => {
    piperTts().isModelAvailable.mockResolvedValue(false);
    rnTts().getInitStatus.mockResolvedValue(undefined);
    rnTts().speak.mockReset();
    rnTts().addEventListener.mockReset();
    rnTts().removeEventListener.mockReset();
  });

  it('emits started then exactly one failed terminal when fallback speak throws after start', async () => {
    rnTts().speak.mockImplementation(() => {
      throw new Error('sync speak failure');
    });

    const emitted: AvFact[] = [];
    const activePlaybackProviderRef = {
      current: null as 'piper' | 'react-native-tts' | null,
    };
    const ttsModuleRef: { current: unknown } = { current: null };
    const playbackInflightAttemptIdRef = { current: 1 };
    const playbackAwaitingTerminalRef = { current: new Set<number>([1]) };

    const result = await runAvPlaybackSpeak({
      text: 'hi',
      boundRequestId: 42,
      posture: 'default',
      attemptId: 1,
      deps: {
        emitFact: (f: AvFact) => emitted.push(f),
        activePlaybackProviderRef,
        ttsModuleRef,
        logInfo: jest.fn(),
        isPlaybackHandoffLogEnabled: false,
        platformOs: 'ios',
        playbackInflightAttemptIdRef,
        attemptId: 1,
        consumePlaybackTerminalSlot,
        playbackAwaitingTerminalRef,
        isPlaybackInterrupted: () => false,
        readPiperErrorCode: () => '',
        setPiperAvailableFlag: jest.fn(),
        piperAvailableCache: false,
      },
    });

    expect(result.kind).toBe('ok');
    const playbackKinds = emitted
      .map(f => f.kind)
      .filter(
        k =>
          k === 'av.playback.started' ||
          k === 'av.playback.completed' ||
          k === 'av.playback.cancelled' ||
          k === 'av.playback.failed',
      );
    expect(playbackKinds).toEqual(['av.playback.started', 'av.playback.failed']);
    const failed = emitted.find(f => f.kind === 'av.playback.failed');
    expect(failed).toMatchObject({
      kind: 'av.playback.failed',
      requestId: 42,
      provider: 'react-native-tts',
    });
    expect(
      failed?.kind === 'av.playback.failed' ? failed.details?.message : null,
    ).toBe('sync speak failure');
    expect(playbackAwaitingTerminalRef.current.has(1)).toBe(false);
    expect(rnTts().removeEventListener).toHaveBeenCalled();
  });

  it('returns fallback_tts_play_failed without playback facts when getInitStatus fails before start', async () => {
    rnTts().getInitStatus.mockRejectedValueOnce(new Error('init failed'));

    const emitted: AvFact[] = [];
    const playbackInflightAttemptIdRef = { current: 1 };
    const playbackAwaitingTerminalRef = { current: new Set<number>([1]) };

    const result = await runAvPlaybackSpeak({
      text: 'hi',
      boundRequestId: 7,
      posture: 'default',
      attemptId: 1,
      deps: {
        emitFact: (f: AvFact) => emitted.push(f),
        activePlaybackProviderRef: { current: null },
        ttsModuleRef: { current: null },
        logInfo: jest.fn(),
        isPlaybackHandoffLogEnabled: false,
        platformOs: 'ios',
        playbackInflightAttemptIdRef,
        attemptId: 1,
        consumePlaybackTerminalSlot,
        playbackAwaitingTerminalRef,
        isPlaybackInterrupted: () => false,
        readPiperErrorCode: () => '',
        setPiperAvailableFlag: jest.fn(),
        piperAvailableCache: false,
      },
    });

    expect(result).toEqual({
      kind: 'fallback_tts_play_failed',
      message: 'init failed',
    });
    expect(
      emitted.filter(f => f.kind.startsWith('av.playback.')),
    ).toHaveLength(0);
  });
});
