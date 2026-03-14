/**
 * Name Shaping: canonical selector vocabulary and metadata.
 * Selectors are coarse sound-shape families, not letters. A name signature is an
 * ordered sequence of selectors; repetition is allowed. BREAK is structural, not
 * phonetic. Raw emitted sequences preserve order and repetition.
 */

/** Canonical selector vocabulary. Six sound-shape families + structural BREAK. */
export type NameShapingSelector =
  | 'BRIGHT'
  | 'ROUND'
  | 'LIQUID'
  | 'SOFT'
  | 'HARD'
  | 'BREAK';

/** Stable ordering for debug overlay and any ordered UI. */
export const SELECTOR_ORDER: readonly NameShapingSelector[] = [
  'BRIGHT',
  'ROUND',
  'LIQUID',
  'SOFT',
  'HARD',
  'BREAK',
] as const;

/** Metadata for one selector: display label and debug description. */
export interface NameShapingSelectorMetadata {
  displayLabel: string;
  debugDescription: string;
}

/** Metadata for each selector. Canonical meanings and typical letter groups. */
export const SELECTOR_METADATA: Readonly<
  Record<NameShapingSelector, NameShapingSelectorMetadata>
> = {
  BRIGHT: {
    displayLabel: 'Bright',
    debugDescription:
      'Front/open vowel energy. Typical letter groups: a, e, i, ai, ay, ee, ea, ie.',
  },
  ROUND: {
    displayLabel: 'Round',
    debugDescription:
      'Back/rounded vowel energy. Typical letter groups: o, u, oo, ou, ow, au, aw, or, ur, er, ar.',
  },
  LIQUID: {
    displayLabel: 'Liquid',
    debugDescription: 'Flowing connector sounds. Typical letter groups: r, l, w, y.',
  },
  SOFT: {
    displayLabel: 'Soft',
    debugDescription:
      'Hiss/breath/friction sounds. Typical letter groups: s, sh, z, zh, f, v, th, h, x.',
  },
  HARD: {
    displayLabel: 'Hard',
    debugDescription:
      'Stop/impact/dense consonant sounds. Typical letter groups: b, p, d, t, g, k, c, q, j, ch, m, n.',
  },
  BREAK: {
    displayLabel: 'Break',
    debugDescription:
      'Explicit separator token. Used for syllable break, manual segment break, or emitted commit boundary. Structural, not phonetic.',
  },
};
