/**
 * Name Shaping: pure card-name-to-signature generator.
 * Converts card names into stable base-name sound-shape signatures using the
 * fixed six-selector vocabulary. No DB, resolver, overlay, or UI; no deduplication.
 */

import type { NameShapingSelector } from './nameShapingConstants';
import type { NormalizedNameShapingSignature } from './nameShapingTypes';

/** Structured result of building a card name signature. */
export interface CardNameSignatureResult {
  normalizedName: string;
  baseName: string;
  fullNameSignature: NormalizedNameShapingSignature;
  baseNameSignature: NormalizedNameShapingSignature;
}

const EMPTY_SIGNATURE_RESULT: CardNameSignatureResult = {
  normalizedName: '',
  baseName: '',
  fullNameSignature: [],
  baseNameSignature: [],
};

/**
 * Explicit substring-to-selector map. Longer substrings first so we consume
 * digraphs/trigraphs before single letters. Do not parse SELECTOR_METADATA prose.
 */
const SUBSTRING_TO_SELECTOR: [string, NameShapingSelector][] = [
  // 2+ chars (longest first)
  ['ee', 'BRIGHT'],
  ['ea', 'BRIGHT'],
  ['ie', 'BRIGHT'],
  ['ai', 'BRIGHT'],
  ['ay', 'BRIGHT'],
  ['ou', 'ROUND'],
  ['ow', 'ROUND'],
  ['au', 'ROUND'],
  ['aw', 'ROUND'],
  ['oo', 'ROUND'],
  ['or', 'ROUND'],
  ['ur', 'ROUND'],
  ['er', 'ROUND'],
  ['ar', 'ROUND'],
  ['th', 'SOFT'],
  ['sh', 'SOFT'],
  ['zh', 'SOFT'],
  ['ch', 'HARD'],
  // 1 char
  ['a', 'BRIGHT'],
  ['e', 'BRIGHT'],
  ['i', 'BRIGHT'],
  ['o', 'ROUND'],
  ['u', 'ROUND'],
  ['r', 'LIQUID'],
  ['l', 'LIQUID'],
  ['w', 'LIQUID'],
  ['y', 'LIQUID'],
  ['s', 'SOFT'],
  ['z', 'SOFT'],
  ['f', 'SOFT'],
  ['v', 'SOFT'],
  ['h', 'SOFT'],
  ['x', 'SOFT'],
  ['b', 'HARD'],
  ['p', 'HARD'],
  ['d', 'HARD'],
  ['t', 'HARD'],
  ['g', 'HARD'],
  ['k', 'HARD'],
  ['c', 'HARD'],
  ['q', 'HARD'],
  ['j', 'HARD'],
  ['m', 'HARD'],
  ['n', 'HARD'],
];

/** Lowercases and removes punctuation; preserves actual spaces, trims and collapses runs to one. */
function normalizeCardName(cardName: string): string {
  const lower = cardName.toLowerCase();
  const lettersAndSpacesOnly = lower.replace(/[^a-z\s]/g, '');
  return lettersAndSpacesOnly.replace(/\s+/g, ' ').trim();
}

/** Builds signature from normalized string: spaces → BREAK; mapped substrings → selector; unmapped chars skipped. Preserves repetition; no deduplication. */
function normalizedToSignature(normalized: string): NameShapingSelector[] {
  const out: NameShapingSelector[] = [];
  let i = 0;
  while (i < normalized.length) {
    if (normalized[i] === ' ') {
      out.push('BREAK');
      i += 1;
      continue;
    }
    let matched = false;
    for (const [sub, sel] of SUBSTRING_TO_SELECTOR) {
      if (normalized.slice(i, i + sub.length) === sub) {
        out.push(sel);
        i += sub.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      i += 1;
    }
  }
  return out;
}

/** Base name = normalized substring before first comma in raw input; if no comma, whole normalized name. */
function extractBaseName(raw: string, normalizedName: string): string {
  const commaIndex = raw.indexOf(',');
  if (commaIndex === -1) return normalizedName;
  return normalizeCardName(raw.slice(0, commaIndex));
}

/**
 * Converts a card name into a stable base-name sound-shape signature.
 * Pure, deterministic, side-effect free.
 */
export function buildCardNameSignature(cardName: string | null | undefined): CardNameSignatureResult {
  if (typeof cardName !== 'string' || cardName.length === 0) {
    return EMPTY_SIGNATURE_RESULT;
  }
  const normalizedName = normalizeCardName(cardName);
  const baseName = extractBaseName(cardName, normalizedName);
  const fullNameSignature: NormalizedNameShapingSignature =
    normalizedToSignature(normalizedName);
  const baseNameSignature: NormalizedNameShapingSignature =
    normalizedToSignature(baseName);
  return {
    normalizedName,
    baseName,
    fullNameSignature,
    baseNameSignature,
  };
}
