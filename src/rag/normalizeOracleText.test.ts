import { normalizeOracleText } from './normalizeOracleText';

describe('normalizeOracleText', () => {
  // ── tap symbol ──────────────────────────────────────────────────────────────

  describe('{T} → "Tap"', () => {
    it('replaces {T} activation cost prefix', () => {
      expect(normalizeOracleText('{T}: Add one mana of any color.')).toBe(
        'Tap: Add one mana of any color.',
      );
    });

    it('replaces {T} mid-sentence', () => {
      expect(normalizeOracleText('Pay {T} as an additional cost.')).toBe(
        'Pay Tap as an additional cost.',
      );
    });

    it('replaces multiple {T} in one string', () => {
      expect(normalizeOracleText('{T}: Do A. {T}: Do B.')).toBe(
        'Tap: Do A. Tap: Do B.',
      );
    });
  });

  // ── single colored mana ──────────────────────────────────────────────────────

  describe('single colored mana symbols', () => {
    it('{G} → "one green mana"', () => {
      expect(normalizeOracleText('{G}')).toBe('one green mana');
    });

    it('{U} → "one blue mana"', () => {
      expect(normalizeOracleText('{U}')).toBe('one blue mana');
    });

    it('{R} → "one red mana"', () => {
      expect(normalizeOracleText('{R}')).toBe('one red mana');
    });

    it('{B} → "one black mana"', () => {
      expect(normalizeOracleText('{B}')).toBe('one black mana');
    });

    it('{W} → "one white mana"', () => {
      expect(normalizeOracleText('{W}')).toBe('one white mana');
    });
  });

  // ── consecutive same-color runs ─────────────────────────────────────────────

  describe('consecutive same-color mana runs', () => {
    it('{G}{G} → "two green mana"', () => {
      expect(normalizeOracleText('{G}{G}')).toBe('two green mana');
    });

    it('{U}{U}{U} → "three blue mana"', () => {
      expect(normalizeOracleText('{U}{U}{U}')).toBe('three blue mana');
    });

    it('{R}{R}{R}{R} → "four red mana"', () => {
      expect(normalizeOracleText('{R}{R}{R}{R}')).toBe('four red mana');
    });

    it('does not merge runs of different colors', () => {
      expect(normalizeOracleText('{G}{U}')).toBe('one green manaone blue mana');
    });
  });

  // ── hybrid symbols ───────────────────────────────────────────────────────────

  describe('hybrid mana symbols', () => {
    it('{G/U} → "one green or blue mana"', () => {
      expect(normalizeOracleText('{G/U}')).toBe('one green or blue mana');
    });

    it('{U/B} → "one blue or black mana"', () => {
      expect(normalizeOracleText('{U/B}')).toBe('one blue or black mana');
    });

    it('{R/W} → "one red or white mana"', () => {
      expect(normalizeOracleText('{R/W}')).toBe('one red or white mana');
    });

    it('{B/G} → "one black or green mana"', () => {
      expect(normalizeOracleText('{B/G}')).toBe('one black or green mana');
    });
  });

  // ── generic numeric mana ─────────────────────────────────────────────────────

  describe('generic numeric mana', () => {
    it('{2} → "two mana"', () => {
      expect(normalizeOracleText('{2}')).toBe('two mana');
    });

    it('{1} → "one mana"', () => {
      expect(normalizeOracleText('{1}')).toBe('one mana');
    });

    it('{0} → "zero mana"', () => {
      expect(normalizeOracleText('{0}')).toBe('zero mana');
    });

    it('{10} → "ten mana"', () => {
      expect(normalizeOracleText('{10}')).toBe('ten mana');
    });

    it('{15} → "15 mana" (beyond word table)', () => {
      expect(normalizeOracleText('{15}')).toBe('15 mana');
    });
  });

  // ── variable mana ─────────────────────────────────────────────────────────

  describe('{X} → "X mana"', () => {
    it('standalone {X}', () => {
      expect(normalizeOracleText('{X}')).toBe('X mana');
    });

    it('{X} in sentence', () => {
      expect(normalizeOracleText('{X}: Add X mana of any color.')).toBe(
        'X mana: Add X mana of any color.',
      );
    });
  });

  // ── multi-symbol sentences ───────────────────────────────────────────────────

  describe('multi-symbol sentences', () => {
    it('Birds of Paradise activation cost', () => {
      expect(normalizeOracleText('{T}: Add one mana of any color.')).toBe(
        'Tap: Add one mana of any color.',
      );
    });

    it('two-color cost + activation', () => {
      expect(normalizeOracleText('{G}{U}: Draw a card.')).toBe(
        'one green manaone blue mana: Draw a card.',
      );
    });

    it('numeric + colored cost', () => {
      expect(normalizeOracleText('{2}{G}: Put a +1/+1 counter on target creature.')).toBe(
        'two manaone green mana: Put a +1/+1 counter on target creature.',
      );
    });
  });

  // ── idempotency ─────────────────────────────────────────────────────────────

  describe('idempotency', () => {
    it('second application does not alter already-normalized text', () => {
      const once = normalizeOracleText('{T}: Add one mana of any color.');
      const twice = normalizeOracleText(once);
      expect(twice).toBe(once);
    });

    it('plain text passes through unchanged', () => {
      const plain = 'Flying. This creature has haste.';
      expect(normalizeOracleText(plain)).toBe(plain);
    });
  });

  // ── fail-closed ─────────────────────────────────────────────────────────────

  describe('fail-closed: unrecognized tokens are preserved', () => {
    it('unknown energy counter token {E} is left unchanged', () => {
      expect(normalizeOracleText('{E}')).toBe('{E}');
    });

    it('snow mana {S} is left unchanged', () => {
      expect(normalizeOracleText('{S}')).toBe('{S}');
    });

    it('empty string returns empty string', () => {
      expect(normalizeOracleText('')).toBe('');
    });
  });

  // ── no regression on plain oracle text ───────────────────────────────────────

  describe('no regression on plain oracle text', () => {
    it('Flying keyword line is untouched', () => {
      expect(normalizeOracleText('Flying')).toBe('Flying');
    });

    it('rule text with no symbols is untouched', () => {
      const rule = 'Nonbasic lands are Mountains.';
      expect(normalizeOracleText(rule)).toBe(rule);
    });

    it('numeric rule citations are not corrupted', () => {
      const text = 'See rule 602.2b for details.';
      expect(normalizeOracleText(text)).toBe(text);
    });
  });
});
