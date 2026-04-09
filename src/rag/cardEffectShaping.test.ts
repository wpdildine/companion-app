import { extractCardOracleText, formatCardEffectAnswer } from './cardEffectShaping';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Minimal bundle: one card, no trailing section. */
function bundle(cardName: string, oracleText: string): string {
  return `[Card: ${cardName}]\n${oracleText}`;
}

/** Bundle with a rule section after the card (the common real-world case). */
function bundleWithRule(
  cardName: string,
  oracleText: string,
  ruleId = '702.9a',
  ruleText = 'Flying definition.',
): string {
  return `[Card: ${cardName}]\n${oracleText}\n\n[Rule ${ruleId}]\n${ruleText}`;
}

// ─── extractCardOracleText ────────────────────────────────────────────────────

describe('extractCardOracleText', () => {
  describe('single-line oracle', () => {
    it('returns the single oracle line when no section follows', () => {
      expect(extractCardOracleText(bundle('Serra Angel', 'Flying, vigilance'), 'Serra Angel')).toBe(
        'Flying, vigilance',
      );
    });

    it('returns the single oracle line when a rule section follows', () => {
      expect(
        extractCardOracleText(bundleWithRule('Serra Angel', 'Flying, vigilance'), 'Serra Angel'),
      ).toBe('Flying, vigilance');
    });
  });

  describe('multi-line oracle (the critical fix)', () => {
    it('returns all oracle lines for Birds of Paradise (flying + mana ability)', () => {
      const ctx = bundleWithRule(
        'Birds of Paradise',
        'Flying\n{T}: Add one mana of any color.',
      );
      expect(extractCardOracleText(ctx, 'Birds of Paradise')).toBe(
        'Flying\n{T}: Add one mana of any color.',
      );
    });

    it('preserves three-line oracle block', () => {
      const ctx = bundleWithRule(
        'Llanowar Elves',
        'Tap: Add {G}.\nHaste\nFlying',
      );
      expect(extractCardOracleText(ctx, 'Llanowar Elves')).toBe(
        'Tap: Add {G}.\nHaste\nFlying',
      );
    });

    it('stops at the next card section, not just at a rule section', () => {
      const ctx =
        '[Card: Forest]\nLand\n\n[Card: Birds of Paradise]\nFlying\n{T}: Add one mana of any color.\n\n[Rule 702.9a]\nFlying def.';
      expect(extractCardOracleText(ctx, 'Birds of Paradise')).toBe(
        'Flying\n{T}: Add one mana of any color.',
      );
    });
  });

  describe('edge cases', () => {
    it('returns null when contextText is empty', () => {
      expect(extractCardOracleText('', 'Birds of Paradise')).toBeNull();
    });

    it('returns null when contextText is undefined', () => {
      expect(extractCardOracleText(undefined, 'Birds of Paradise')).toBeNull();
    });

    it('returns null when the card is not in the bundle', () => {
      expect(extractCardOracleText(bundle('Serra Angel', 'Flying, vigilance'), 'Lightning Bolt')).toBeNull();
    });

    it('handles card names with regex-special characters safely', () => {
      const ctx = bundle('Reaper of the Wilds', 'Deathtouch\nHexproof as long as a spell or ability targets it');
      expect(extractCardOracleText(ctx, 'Reaper of the Wilds')).toBe(
        'Deathtouch\nHexproof as long as a spell or ability targets it',
      );
    });

    it('is case-insensitive on the card header', () => {
      const ctx = '[Card: birds of paradise]\nFlying\n{T}: Add one mana of any color.';
      expect(extractCardOracleText(ctx, 'Birds of Paradise')).toBe(
        'Flying\n{T}: Add one mana of any color.',
      );
    });
  });
});

// ─── formatCardEffectAnswer ────────────────────────────────────────────────────

describe('formatCardEffectAnswer', () => {
  // ── single-line: preserved existing behavior ───────────────────────────────

  describe('single-line oracle (existing behavior preserved)', () => {
    it('plain text → "Card: text."', () => {
      expect(formatCardEffectAnswer('Serra Angel', 'Flying, vigilance')).toBe(
        'Serra Angel: Flying, vigilance.',
      );
    });

    it('"X are Y" → "Card turns x into Y."', () => {
      expect(formatCardEffectAnswer('Blood Moon', 'Nonbasic lands are Mountains.')).toBe(
        'Blood Moon turns nonbasic lands into Mountains.',
      );
    });

    it('"X is Y" → "Card makes x Y."', () => {
      expect(formatCardEffectAnswer('Humility', 'Each creature is 1/1 and has no abilities.')).toBe(
        'Humility makes each creature 1/1 and has no abilities.',
      );
    });
  });

  // ── single-line: symbol normalization applies ──────────────────────────────

  describe('single-line with symbol normalization', () => {
    it('{T} in single-line oracle is normalized', () => {
      expect(formatCardEffectAnswer('Llanowar Elves', '{T}: Add {G}.')).toBe(
        'Llanowar Elves: Tap: Add one green mana.',
      );
    });
  });

  // ── multiline: Birds of Paradise (the critical case) ──────────────────────

  describe('multi-line oracle', () => {
    it('Birds of Paradise: includes both flying and the mana ability', () => {
      expect(
        formatCardEffectAnswer(
          'Birds of Paradise',
          'Flying\n{T}: Add one mana of any color.',
        ),
      ).toBe('Birds of Paradise has flying and Tap: Add one mana of any color.');
    });

    it('multiple keywords only → "Card has A and B."', () => {
      expect(
        formatCardEffectAnswer('Baneslayer Angel', 'Flying\nFirst strike\nLifelink'),
      ).toBe('Baneslayer Angel has flying and first strike and lifelink.');
    });

    it('keyword + two ability lines → all included', () => {
      expect(
        formatCardEffectAnswer(
          'Test Card',
          'Flying\n{T}: Do A.\n{T}: Do B.',
        ),
      ).toBe('Test Card has flying and Tap: Do A and Tap: Do B.');
    });

    it('abilities only (no keywords) → "Card: A. B."', () => {
      expect(
        formatCardEffectAnswer(
          'Doom Blade',
          'Destroy target nonblack creature.\nIt cannot be regenerated.',
        ),
      ).toBe('Doom Blade: Destroy target nonblack creature. It cannot be regenerated.');
    });

    it('multiline symbol normalization applies across all lines', () => {
      expect(
        formatCardEffectAnswer(
          'Lotus Cobra',
          'Landfall — Whenever a land enters the battlefield under your control, add {G}.\n{T}: Add {G}{G}.',
        ),
      ).toBe(
        'Lotus Cobra: Landfall — Whenever a land enters the battlefield under your control, add one green mana. Tap: Add two green mana.',
      );
    });

    it('trailing periods on each line are not doubled', () => {
      const result = formatCardEffectAnswer(
        'Birds of Paradise',
        'Flying\n{T}: Add one mana of any color.',
      );
      expect(result).not.toMatch(/\.\./);
      expect(result.endsWith('.')).toBe(true);
    });
  });

  // ── round-trip: extract then format ──────────────────────────────────────

  describe('extract → format round-trip', () => {
    it('full Birds of Paradise pipeline produces expected sentence', () => {
      const ctx = bundleWithRule(
        'Birds of Paradise',
        'Flying\n{T}: Add one mana of any color.',
      );
      const oracle = extractCardOracleText(ctx, 'Birds of Paradise');
      expect(oracle).not.toBeNull();
      const result = formatCardEffectAnswer('Birds of Paradise', oracle!);
      expect(result).toBe(
        'Birds of Paradise has flying and Tap: Add one mana of any color.',
      );
      expect(result).not.toContain('{T}');
      expect(result).not.toContain('{G}');
    });

    it('single-line card round-trip is unchanged from before', () => {
      const ctx = bundle('Serra Angel', 'Flying, vigilance');
      const oracle = extractCardOracleText(ctx, 'Serra Angel');
      expect(formatCardEffectAnswer('Serra Angel', oracle!)).toBe(
        'Serra Angel: Flying, vigilance.',
      );
    });

    it('no brace-notation tokens survive in output', () => {
      const ctx = bundleWithRule(
        'Llanowar Elves',
        'Tap: Add {G}.',
      );
      const oracle = extractCardOracleText(ctx, 'Llanowar Elves')!;
      const result = formatCardEffectAnswer('Llanowar Elves', oracle);
      expect(result).not.toMatch(/\{[^}]+\}/);
    });
  });
});
