import {
  mapPlaybackPostureToPiperOptions,
  type PlaybackPosture,
} from './avPlaybackCommand';
import { selectAvPlaybackRouteMechanics } from './avSurface';

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

  it('selectAvPlaybackRouteMechanics is pure capability routing', () => {
    expect(selectAvPlaybackRouteMechanics(true)).toBe('piper');
    expect(selectAvPlaybackRouteMechanics(false)).toBe('react-native-tts');
  });

  it('PlaybackPosture is a closed small union at compile time', () => {
    const p: PlaybackPosture = 'default';
    expect(p).toBe('default');
  });
});
