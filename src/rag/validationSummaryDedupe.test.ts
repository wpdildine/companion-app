import type { ValidationSummary } from './validate';
import {
  canonicalCardKey,
  dedupeValidationSummary,
} from './validationSummaryDedupe';

function emptyStats(): ValidationSummary['stats'] {
  return {
    cardHitRate: 0,
    ruleHitRate: 0,
    unknownCardCount: 0,
    invalidRuleCount: 0,
  };
}

describe('canonicalCardKey', () => {
  it('normalizes by trimmed lowercased canonical', () => {
    expect(
      canonicalCardKey({ raw: 'x', canonical: 'Birds of Paradise' }),
    ).toBe('birds of paradise');
  });

  it('falls back to raw when canonical is absent', () => {
    expect(canonicalCardKey({ raw: '  Lightning Bolt ' })).toBe('lightning bolt');
  });
});

describe('dedupeValidationSummary', () => {
  it('merges resolver row with doc_id and validator row without doc_id (same canonical)', () => {
    const summary: ValidationSummary = {
      cards: [
        {
          raw: 'birds of paradise',
          canonical: 'Birds of Paradise',
          status: 'in_pack',
        },
        {
          raw: 'Birds of Paradise',
          canonical: 'Birds of Paradise',
          doc_id: 'cards:42',
          oracleText: 'Flying',
          status: 'in_pack',
        },
      ],
      rules: [],
      stats: emptyStats(),
    };
    const out = dedupeValidationSummary(summary);
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0]!.canonical).toBe('Birds of Paradise');
    expect(out.cards[0]!.doc_id).toBe('cards:42');
    expect(out.cards[0]!.oracleText).toBe('Flying');
  });

  it('collapses repeated identical canonical entries from merge paths', () => {
    const summary: ValidationSummary = {
      cards: [
        {
          raw: 'Birds of Paradise',
          canonical: 'Birds of Paradise',
          status: 'in_pack',
        },
        {
          raw: 'Birds of Paradise',
          canonical: 'Birds of Paradise',
          status: 'in_pack',
        },
      ],
      rules: [],
      stats: emptyStats(),
    };
    const out = dedupeValidationSummary(summary);
    expect(out.cards.map(c => c.canonical ?? c.raw)).toEqual([
      'Birds of Paradise',
    ]);
  });

  it('keeps two distinct cards in first-seen order', () => {
    const summary: ValidationSummary = {
      cards: [
        {
          raw: 'Lightning Bolt',
          canonical: 'Lightning Bolt',
          status: 'in_pack',
        },
        {
          raw: 'Birds of Paradise',
          canonical: 'Birds of Paradise',
          status: 'in_pack',
        },
      ],
      rules: [],
      stats: emptyStats(),
    };
    const out = dedupeValidationSummary(summary);
    expect(out.cards.map(c => c.canonical ?? c.raw)).toEqual([
      'Lightning Bolt',
      'Birds of Paradise',
    ]);
  });

  it('preserves first occurrence order when merging duplicate into earlier slot', () => {
    const summary: ValidationSummary = {
      cards: [
        {
          raw: 'A',
          canonical: 'Alpha',
          status: 'in_pack',
        },
        {
          raw: 'B',
          canonical: 'Beta',
          status: 'in_pack',
        },
        {
          raw: 'alpha',
          canonical: 'Alpha',
          doc_id: 'cards:1',
          status: 'in_pack',
        },
      ],
      rules: [],
      stats: emptyStats(),
    };
    const out = dedupeValidationSummary(summary);
    expect(out.cards.map(c => c.canonical ?? c.raw)).toEqual(['Alpha', 'Beta']);
    expect(out.cards[0]!.doc_id).toBe('cards:1');
  });
});
