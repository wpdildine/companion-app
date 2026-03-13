/**
 * normalizeNameShapingSequence: raw token → normalized selector signature.
 * Tests assert on contents of the result, not identity or mutability.
 */

import { normalizeNameShapingSequence } from './normalizeNameShapingSequence';

function tok(selector: 'BRIGHT' | 'ROUND' | 'LIQUID' | 'SOFT' | 'HARD' | 'BREAK') {
  return { selector };
}

describe('normalizeNameShapingSequence', () => {
  it('returns empty array for empty input', () => {
    const result = normalizeNameShapingSequence([]);
    expect(result).toEqual([]);
  });

  it('leaves single non-BREAK selector unchanged', () => {
    expect(normalizeNameShapingSequence([tok('BRIGHT')])).toEqual(['BRIGHT']);
    expect(normalizeNameShapingSequence([tok('SOFT')])).toEqual(['SOFT']);
  });

  it('returns empty for single BREAK (trimmed)', () => {
    expect(normalizeNameShapingSequence([tok('BREAK')])).toEqual([]);
  });

  it('collapses adjacent duplicate selectors', () => {
    expect(
      normalizeNameShapingSequence([
        tok('BRIGHT'),
        tok('BRIGHT'),
        tok('LIQUID'),
      ])
    ).toEqual(['BRIGHT', 'LIQUID']);
  });

  it('collapses adjacent BREAK runs', () => {
    expect(
      normalizeNameShapingSequence([
        tok('SOFT'),
        tok('BREAK'),
        tok('BREAK'),
        tok('HARD'),
      ])
    ).toEqual(['SOFT', 'BREAK', 'HARD']);
  });

  it('trims leading BREAK', () => {
    expect(
      normalizeNameShapingSequence([tok('BREAK'), tok('SOFT'), tok('HARD')])
    ).toEqual(['SOFT', 'HARD']);
  });

  it('trims trailing BREAK', () => {
    expect(
      normalizeNameShapingSequence([tok('SOFT'), tok('HARD'), tok('BREAK')])
    ).toEqual(['SOFT', 'HARD']);
  });

  it('preserves interior BREAK', () => {
    expect(
      normalizeNameShapingSequence([tok('SOFT'), tok('BREAK'), tok('HARD')])
    ).toEqual(['SOFT', 'BREAK', 'HARD']);
  });

  it('preserves non-adjacent repeated selectors', () => {
    expect(
      normalizeNameShapingSequence([tok('SOFT'), tok('HARD'), tok('SOFT')])
    ).toEqual(['SOFT', 'HARD', 'SOFT']);
  });

  it('returns empty when all tokens are BREAK after collapse', () => {
    expect(
      normalizeNameShapingSequence([tok('BREAK'), tok('BREAK')])
    ).toEqual([]);
  });

  it('ignores timestamp when present (contract: selector only)', () => {
    const result = normalizeNameShapingSequence([
      { selector: 'BRIGHT', timestamp: 1 },
      { selector: 'LIQUID', timestamp: 2 },
    ]);
    expect(result).toEqual(['BRIGHT', 'LIQUID']);
  });
});
