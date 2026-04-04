import { toSpeechText } from './speechTransform';

describe('toSpeechText', () => {
  it('strips rule numbers and appends anchor for cited rules', () => {
    const input =
      'First applies here. See rules 603.3b, 603.3d, and 117.3a.';
    expect(toSpeechText(input)).toBe(
      "First applies here. I've attached the relevant rules.",
    );
  });

  it('preserves main sentence when no rule ids', () => {
    const input = 'If you cast it, then the effect resolves.';
    expect(toSpeechText(input)).toBe(input);
  });

  it('appends anchor only when numeric rule refs were present', () => {
    expect(
      toSpeechText('Layer rule applies to permanents.'),
    ).toBe('Layer rule applies to permanents.');
  });

  it('handles standalone rule list', () => {
    expect(toSpeechText('603.3b, 603.3d, 603.5')).toBe(
      "I've attached the relevant rules.",
    );
  });

  it('does not append anchor when no rule references', () => {
    expect(toSpeechText('Blood Moon changes land types.')).toBe(
      'Blood Moon changes land types.',
    );
  });
});
