/**
 * Name Shaping: pure resolver that ranks proper-name candidates by selector signature.
 * Consumes the resolver index and a normalized selector signature; returns top-K
 * ranked candidates. Deterministic heuristics only; no ML, embeddings, or RAG.
 */

import type {
  NameShapingResolverCandidate,
  NormalizedNameShapingSignature,
  ResolverIndex,
  ResolverIndexEntry,
} from '../foundation/nameShapingTypes';

const DEFAULT_TOP_K = 5;

export interface ScoreResult {
  score: number;
  matchReason: string;
}

/**
 * Count how many input selectors appear in order in base (two-pointer scan).
 */
function countOrderedOverlap(
  input: NormalizedNameShapingSignature,
  base: NormalizedNameShapingSignature
): number {
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < input.length && j < base.length) {
    if (input[i] === base[j]) {
      matched++;
      i++;
    }
    j++;
  }
  return matched;
}

/**
 * Deterministic scoring: exact match, prefix match, or ordered overlap.
 * Integer scores only; explicit rounding and clamping.
 */
export function scoreSignatureMatch(
  input: NormalizedNameShapingSignature,
  base: NormalizedNameShapingSignature
): ScoreResult {
  const ilen = input.length;
  const blen = base.length;

  if (ilen === 0 && blen === 0) {
    return { score: 100, matchReason: 'exact' };
  }
  if (ilen === 0) {
    return { score: 0, matchReason: 'overlap' };
  }

  // Exact: same length and every index matches
  if (ilen === blen) {
    let exact = true;
    for (let i = 0; i < ilen; i++) {
      if (input[i] !== base[i]) {
        exact = false;
        break;
      }
    }
    if (exact) {
      return { score: 100, matchReason: 'exact' };
    }
  }

  // Input is prefix of base
  if (ilen <= blen) {
    let prefix = true;
    for (let i = 0; i < ilen; i++) {
      if (input[i] !== base[i]) {
        prefix = false;
        break;
      }
    }
    if (prefix) {
      const score = Math.max(0, 90 - (blen - ilen));
      return { score, matchReason: 'prefix' };
    }
  }

  // Base is prefix of input
  if (blen <= ilen) {
    let prefixTarget = true;
    for (let i = 0; i < blen; i++) {
      if (base[i] !== input[i]) {
        prefixTarget = false;
        break;
      }
    }
    if (prefixTarget) {
      const score = Math.max(0, 80 - (ilen - blen));
      return { score, matchReason: 'prefix_target_shorter' };
    }
  }

  // Ordered overlap: count in-order matches, then explicit arithmetic
  const matchedCount = countOrderedOverlap(input, base);
  if (matchedCount === 0) {
    return { score: 0, matchReason: 'overlap' };
  }
  const lengthPenalty = Math.abs(ilen - blen) * 3;
  const rawOverlap = Math.round((matchedCount / ilen) * 70);
  const score = Math.max(0, rawOverlap - lengthPenalty);
  return { score, matchReason: 'overlap' };
}

/**
 * Map an index entry and score result to a resolver candidate.
 */
function toCandidate(
  entry: ResolverIndexEntry,
  score: number,
  matchReason: string
): NameShapingResolverCandidate {
  return {
    cardId: entry.cardId,
    displayName: entry.displayName,
    score,
    signature: entry.baseNameSignature,
    matchReason,
  };
}

/**
 * Resolve a normalized selector signature against the resolver index.
 * Returns top-K candidates with score > 0, sorted by score descending,
 * then by displayName ascending for ties. This first pass ranks against
 * baseNameSignature only; full-name-sensitive disambiguation is deferred.
 */
export function resolveProperNounBySignature(
  index: ResolverIndex,
  inputSignature: NormalizedNameShapingSignature,
  options?: { topK?: number }
): readonly NameShapingResolverCandidate[] {
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const entries =
    inputSignature.length === 0
      ? index.getAllIndexedCards()
      : index.getEntriesSharingSelectors(inputSignature);

  const candidates: NameShapingResolverCandidate[] = [];
  for (const entry of entries) {
    const { score, matchReason } = scoreSignatureMatch(
      inputSignature,
      entry.baseNameSignature
    );
    if (score > 0) {
      candidates.push(toCandidate(entry, score, matchReason));
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return candidates.slice(0, topK);
}
