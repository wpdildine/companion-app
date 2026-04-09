import { stripHumanShortInlineRuleQuoteForCommit } from './stripHumanShortInlineRuleQuoteForCommit';

describe('stripHumanShortInlineRuleQuoteForCommit', () => {
  it('removes newline + standalone quoted rule line after concise ruling', () => {
    const ruling = 'The active player responds first, then others in turn order.';
    const excerpt =
      '603.11. Normally, all players have the opportunity to cast spells...';
    const input = `${ruling}\n"${excerpt}"`;
    expect(stripHumanShortInlineRuleQuoteForCommit(input)).toBe(ruling);
    expect(stripHumanShortInlineRuleQuoteForCommit(input)).not.toMatch(/\n"/);
  });

  it('handles curly quotes on the appendix line', () => {
    const ruling = 'Short answer.';
    const input = `${ruling}\n\u201c603.3a. Some rule text here.\u201d`;
    expect(stripHumanShortInlineRuleQuoteForCommit(input)).toBe(ruling);
  });

  it('keeps multi-line ruling when only the last added line is quote-only', () => {
    const a = 'First sentence of ruling.';
    const b = 'Second sentence continues the answer.';
    const input = `${a}\n${b}\n"603.3b. Excerpt."`;
    expect(stripHumanShortInlineRuleQuoteForCommit(input)).toBe(`${a}\n${b}`);
  });

  it('does not strip when second line is not a quote-only appendix', () => {
    const input =
      'The stack resolves top down.\nSee rule 405 for more on the stack.';
    expect(stripHumanShortInlineRuleQuoteForCommit(input)).toBe(input);
  });

  it('returns original text when there is no human-short quoted inner', () => {
    const input = 'Just one line with no appendix quote pattern.';
    expect(stripHumanShortInlineRuleQuoteForCommit(input)).toBe(input);
  });
});
