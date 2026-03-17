/**
 * Name Shaping: feature-local state owner.
 * Owns NameShapingState and exposes explicit update actions for overlay and touch executables.
 * No normalization, resolver scoring, DB, pack, or orchestration.
 *
 * disable() = set enabled false and full reset (re-enable starts fresh).
 * clear() = reset feature data but preserve current enabled (clear interaction data while staying enabled).
 */

import { useCallback, useMemo, useState } from 'react';
import type { NameShapingSelector } from '../foundation/nameShapingConstants';
import type {
  NameShapingRawToken,
  NameShapingResolverCandidate,
  NameShapingState,
} from '../foundation/nameShapingTypes';
import { beginNameShapingCommitTrace } from './nameShapingCommitTrace';
import { normalizeNameShapingSequence } from '../foundation/normalizeNameShapingSequence';

const initialNameShapingState: NameShapingState = {
  enabled: false,
  rawEmittedSequence: [],
  normalizedSignature: [],
  committedSignature: [],
  resolverCandidates: [],
  selectedCandidate: null,
  activeSelector: null,
};

function createInitialNameShapingState(): NameShapingState {
  return {
    ...initialNameShapingState,
    rawEmittedSequence: [],
    normalizedSignature: [],
    resolverCandidates: [],
  };
}

function withNormalizedSignature(
  prev: NameShapingState,
  rawEmittedSequence: readonly NameShapingRawToken[],
): NameShapingState {
  return {
    ...prev,
    rawEmittedSequence: [...rawEmittedSequence],
    normalizedSignature: normalizeNameShapingSequence(rawEmittedSequence),
    committedSignature: [],
    resolverCandidates: [],
    selectedCandidate: null,
  };
}

export interface NameShapingActions {
  enable: () => void;
  disable: () => void;
  clear: () => void;
  appendEmittedToken: (token: NameShapingRawToken) => void;
  setActiveSelector: (selector: NameShapingSelector | null) => void;
  commitBreak: () => void;
  commitResolution: () => void;
  setResolverCandidates: (candidates: readonly NameShapingResolverCandidate[]) => void;
  setSelectedCandidate: (candidate: NameShapingResolverCandidate | null) => void;
}

export function useNameShapingState(): { state: NameShapingState; actions: NameShapingActions } {
  const [state, setState] = useState<NameShapingState>(() => createInitialNameShapingState());

  const enable = useCallback(() => {
    setState((prev) => ({ ...prev, enabled: true }));
  }, []);

  /** Disable turns off the subsystem and clears feature state so re-enable starts fresh. */
  const disable = useCallback(() => {
    setState(createInitialNameShapingState());
  }, []);

  /** Reset feature data; preserve current enabled. */
  const clear = useCallback(() => {
    setState((prev) => ({
      ...createInitialNameShapingState(),
      enabled: prev.enabled,
    }));
  }, []);

  const appendEmittedToken = useCallback((token: NameShapingRawToken) => {
    setState((prev) => withNormalizedSignature(prev, [...prev.rawEmittedSequence, token]));
  }, []);

  const setActiveSelector = useCallback((selector: NameShapingSelector | null) => {
    setState((prev) => ({ ...prev, activeSelector: selector }));
  }, []);

  /** Append BREAK token; v1 no timestamp. */
  const commitBreak = useCallback(() => {
    setState((prev) =>
      withNormalizedSignature(prev, [...prev.rawEmittedSequence, { selector: 'BREAK' }]),
    );
  }, []);

  const commitResolution = useCallback(() => {
    setState((prev) => {
      beginNameShapingCommitTrace(prev.normalizedSignature);
      return {
        ...prev,
        committedSignature: [...prev.normalizedSignature],
      };
    });
  }, []);

  const setResolverCandidates = useCallback((candidates: readonly NameShapingResolverCandidate[]) => {
    setState((prev) => ({ ...prev, resolverCandidates: [...candidates] }));
  }, []);

  const setSelectedCandidate = useCallback((candidate: NameShapingResolverCandidate | null) => {
    setState((prev) => ({ ...prev, selectedCandidate: candidate }));
  }, []);

  const actions = useMemo<NameShapingActions>(() => ({
    enable,
    disable,
    clear,
    appendEmittedToken,
    setActiveSelector,
    commitBreak,
    commitResolution,
    setResolverCandidates,
    setSelectedCandidate,
  }), [
    enable,
    disable,
    clear,
    appendEmittedToken,
    setActiveSelector,
    commitBreak,
    commitResolution,
    setResolverCandidates,
    setSelectedCandidate,
  ]);

  return { state, actions };
}
