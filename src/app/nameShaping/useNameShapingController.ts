/**
 * Name Shaping: integration hook that wires raw emitted sequence → normalized
 * signature → resolver candidates and keeps selectedCandidate coherent.
 * Purely side-effect plumbing; returns void.
 */

import { useEffect } from 'react';
import type { NameShapingActions } from './useNameShapingState';
import type {
  NameShapingResolverCandidate,
  NameShapingState,
  NormalizedNameShapingSignature,
  ResolverIndex,
} from './nameShapingTypes';
import { normalizeNameShapingSequence } from './normalizeNameShapingSequence';
import { resolveProperNounBySignature } from './resolveProperNounBySignature';

/** Shallow ordered selector equality: same length and same selector at each index. */
function signatureEquals(
  a: NormalizedNameShapingSignature,
  b: NormalizedNameShapingSignature
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Single candidate equality: cardId, score, matchReason, and signature contents. */
function candidateEquals(
  a: NameShapingResolverCandidate,
  b: NameShapingResolverCandidate
): boolean {
  return (
    a.cardId === b.cardId &&
    a.score === b.score &&
    (a.matchReason ?? '') === (b.matchReason ?? '') &&
    signatureEquals(a.signature, b.signature)
  );
}

/** Shallow ordered comparison: same length and equal candidate at each index. */
function candidatesEqual(
  left: readonly NameShapingResolverCandidate[],
  right: readonly NameShapingResolverCandidate[]
): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (!candidateEquals(left[i]!, right[i]!)) return false;
  }
  return true;
}

/** Selected candidate equality: both null or both non-null and candidate-equal. */
function selectedCandidateEquals(
  next: NameShapingResolverCandidate | null,
  current: NameShapingResolverCandidate | null
): boolean {
  if (next === null && current === null) return true;
  if (next === null || current === null) return false;
  return next === current;
}

/**
 * Side-effect hook: when rawEmittedSequence changes, compute normalized signature
 * and write to state; when normalizedSignature (or resolverIndex/selectedCandidate)
 * changes, resolve candidates and reconcile selection. Only writes when values
 * actually differ. Returns void.
 */
export function useNameShapingController(
  state: NameShapingState,
  actions: NameShapingActions,
  resolverIndex: ResolverIndex | null
): void {
  // Effect 1: raw → normalized
  useEffect(() => {
    const normalized = normalizeNameShapingSequence(state.rawEmittedSequence);
    if (!signatureEquals(normalized, state.normalizedSignature)) {
      actions.setNormalizedSignature(normalized);
    }
  }, [state.rawEmittedSequence, state.normalizedSignature, actions]);

  // Effect 2: signature → candidates + selection
  useEffect(() => {
    const { normalizedSignature, resolverCandidates, selectedCandidate } = state;

    if (normalizedSignature.length === 0) {
      if (resolverCandidates.length > 0) {
        actions.setResolverCandidates([]);
      }
      if (selectedCandidate !== null) {
        actions.setSelectedCandidate(null);
      }
      return;
    }

    if (resolverIndex === null) {
      if (resolverCandidates.length > 0) {
        actions.setResolverCandidates([]);
      }
      if (selectedCandidate !== null) {
        actions.setSelectedCandidate(null);
      }
      return;
    }

    const candidates = resolveProperNounBySignature(resolverIndex, normalizedSignature);
    const candidatesChanged = !candidatesEqual(candidates, resolverCandidates);

    if (candidatesChanged) {
      actions.setResolverCandidates(candidates);
    }

    const candidatesForSelection = candidatesChanged
      ? candidates
      : resolverCandidates;

    const nextSelected =
      selectedCandidate !== null
        ? candidatesForSelection.find((c) => c.cardId === selectedCandidate.cardId) ?? null
        : null;

    if (!selectedCandidateEquals(nextSelected, selectedCandidate)) {
      actions.setSelectedCandidate(nextSelected);
    }
  }, [
    state.normalizedSignature,
    state.resolverCandidates,
    state.selectedCandidate,
    resolverIndex,
    actions,
  ]);
}
