/**
 * Deterministic normalization of MTG brace notation to human-readable text.
 * Applied before committing response text so no raw symbol tokens reach the UI or TTS.
 *
 * Invariant: all brace-notation tokens recognized here are converted; unrecognized tokens
 * are left unchanged (fail-closed — never silently corrupt unknown future symbols).
 *
 * Pure, no side effects, idempotent (safe to call multiple times on the same string).
 */

const COLOR_NAMES: Readonly<Record<string, string>> = {
  G: 'green',
  U: 'blue',
  R: 'red',
  B: 'black',
  W: 'white',
};

const NUMBER_WORDS: Readonly<Record<number, string>> = {
  0: 'zero',
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
};

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * Convert MTG brace notation in `input` to human-readable equivalents.
 *
 * Handled:
 *   {T}       → "Tap"
 *   {G}       → "one green mana"  (runs: {G}{G} → "two green mana")
 *   {U}       → "one blue mana"
 *   {R}       → "one red mana"
 *   {B}       → "one black mana"
 *   {W}       → "one white mana"
 *   {G/U}     → "one green or blue mana"  (any two-color hybrid)
 *   {2}       → "two mana"  (any non-negative integer)
 *   {X}       → "X mana"
 *
 * Unrecognized tokens are left unchanged.
 */
export function normalizeOracleText(input: string): string {
  if (!input) return input;
  let s = input;

  // Hybrid two-color mana — must run before single-color to avoid partial substitution.
  // {G/U} → "one green or blue mana"
  s = s.replace(/\{([GURBW])\/([GURBW])\}/g, (_match, a: string, b: string) => {
    const colorA = COLOR_NAMES[a];
    const colorB = COLOR_NAMES[b];
    if (colorA && colorB) return `one ${colorA} or ${colorB} mana`;
    return _match; // fail-closed: leave unknown hybrid unchanged
  });

  // Tap symbol: {T} → "Tap"
  s = s.replace(/\{T\}/g, 'Tap');

  // Consecutive runs of the same colored mana: {G}{G} → "two green mana"
  // Each symbol is exactly 3 chars (e.g. "{G}"), so count = match.length / 3.
  for (const sym of Object.keys(COLOR_NAMES)) {
    const colorName = COLOR_NAMES[sym]!;
    const run = new RegExp(`(\\{${sym}\\})+`, 'g');
    s = s.replace(run, (match) => {
      const count = match.length / 3; // "{G}".length === 3
      return `${numberWord(count)} ${colorName} mana`;
    });
  }

  // Generic numeric mana: {0}, {1}, {2}, …
  s = s.replace(/\{(\d+)\}/g, (_match, n: string) => {
    const num = parseInt(n, 10);
    return `${numberWord(num)} mana`;
  });

  // Variable mana: {X} → "X mana"
  s = s.replace(/\{X\}/g, 'X mana');

  return s;
}
