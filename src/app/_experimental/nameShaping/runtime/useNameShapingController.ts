/**
 * Name Shaping: integration hook that resolves committed signatures into
 * candidates and keeps selectedCandidate coherent. Purely side-effect plumbing;
 * returns void.
 */

import { useEffect, useMemo } from 'react';
import type { NameShapingActions } from './useNameShapingState';
import type {
  NameShapingResolverCandidate,
  NameShapingState,
  NormalizedNameShapingSignature,
  ResolverIndex,
} from '../foundation/nameShapingTypes';
import { logInfo } from '../../../../shared/logging';
import { getActiveNameShapingCommitTrace } from './nameShapingCommitTrace';
import { resolveProperNounBySignature } from '../resolver/resolveProperNounBySignature';

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
 * Side-effect hook: when committedSignature changes, resolve candidates and
 * reconcile selection. Live touch entry updates raw/normalized state elsewhere;
 * this hook only reacts to explicit resolution commits.
 */
export function useNameShapingController(
  state: NameShapingState,
  actions: NameShapingActions,
  resolverIndex: ResolverIndex | null
): void {
  const {
    setResolverCandidates,
    setSelectedCandidate,
  } = actions;

  const resolvedCandidates = useMemo(() => {
    if (resolverIndex === null || state.committedSignature.length === 0) {
      return [] as readonly NameShapingResolverCandidate[];
    }
    const trace = getActiveNameShapingCommitTrace(state.committedSignature);
    if (trace) {
      logInfo('AgentSurface', 'NameShaping commit trace resolve start', {
        traceId: trace.id,
        elapsedMs: trace.elapsedMs,
        signatureLength: state.committedSignature.length,
      });
    }
    const resolveStartMs = Date.now();
    const results = resolveProperNounBySignature(resolverIndex, state.committedSignature);
    const resolveEndMs = Date.now();
    if (trace) {
      logInfo('AgentSurface', 'NameShaping commit trace resolve end', {
        traceId: trace.id,
        elapsedMs: trace.elapsedMs,
        resolveDurationMs: Math.round((resolveEndMs - resolveStartMs) * 1000) / 1000,
        candidateCount: results.length,
      });
    }
    return results;
  }, [resolverIndex, state.committedSignature]);

  // Effect: committed signature → candidates + selection
  useEffect(() => {
    const { resolverCandidates, selectedCandidate } = state;

    if (state.committedSignature.length === 0) {
      if (resolverCandidates.length > 0) {
        setResolverCandidates([]);
      }
      if (selectedCandidate !== null) {
        setSelectedCandidate(null);
      }
      return;
    }

    if (resolverIndex === null) {
      if (resolverCandidates.length > 0) {
        setResolverCandidates([]);
      }
      if (selectedCandidate !== null) {
        setSelectedCandidate(null);
      }
      return;
    }
    const candidatesChanged = !candidatesEqual(resolvedCandidates, resolverCandidates);

    if (candidatesChanged) {
      const trace = getActiveNameShapingCommitTrace(state.committedSignature);
      if (trace) {
        logInfo('AgentSurface', 'NameShaping commit trace state write', {
          traceId: trace.id,
          elapsedMs: trace.elapsedMs,
          candidateCount: resolvedCandidates.length,
        });
      }
      setResolverCandidates(resolvedCandidates);
    }

    const candidatesForSelection = candidatesChanged
      ? resolvedCandidates
      : resolverCandidates;

    const nextSelected =
      selectedCandidate !== null
        ? candidatesForSelection.find((c) => c.cardId === selectedCandidate.cardId) ?? null
        : null;

    if (!selectedCandidateEquals(nextSelected, selectedCandidate)) {
      setSelectedCandidate(nextSelected);
    }
  }, [
    state.committedSignature,
    state.selectedCandidate,
    state.resolverCandidates,
    resolverIndex,
    resolvedCandidates,
    setResolverCandidates,
    setSelectedCandidate,
  ]);
}
