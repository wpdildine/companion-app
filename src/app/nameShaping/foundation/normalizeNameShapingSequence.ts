/**
 * Name Shaping: pure normalization from raw emitted tokens to a stable selector
 * signature for the resolver. Sequence-based only; no timing, DB, or UI.
 */

import type {
  NameShapingRawToken,
  NormalizedNameShapingSignature,
} from '../foundation/nameShapingTypes';

/**
 * Normalize a raw emitted token sequence into a stable selector signature.
 * Collapses adjacent duplicate selectors, collapses adjacent BREAK runs,
 * trims leading and trailing BREAK, preserves order and interior BREAK.
 * Output is suitable for resolveProperNounBySignature.
 */
export function normalizeNameShapingSequence(
  rawTokens: readonly NameShapingRawToken[]
): NormalizedNameShapingSignature {
  if (rawTokens.length === 0) {
    return [];
  }

  const selectors = rawTokens.map((t) => t.selector);

  const collapsed: Array<NameShapingRawToken['selector']> = [];
  for (let i = 0; i < selectors.length; i++) {
    const s = selectors[i]!;
    if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== s) {
      collapsed.push(s);
    }
  }

  let start = 0;
  while (start < collapsed.length && collapsed[start] === 'BREAK') {
    start++;
  }
  if (start === collapsed.length) {
    return [];
  }

  let end = collapsed.length - 1;
  while (end >= start && collapsed[end] === 'BREAK') {
    end--;
  }

  return collapsed.slice(start, end + 1);
}
