/**
 * Name Shaping: feature-local state owner.
 * Owns NameShapingState and exposes explicit update actions for overlay and touch executables.
 * No normalization, resolver scoring, DB, pack, or orchestration.
 *
 * disable() = set enabled false and full reset (re-enable starts fresh).
 * clear() = reset feature data but preserve current enabled (clear interaction data while staying enabled).
 */

import { useCallback, useState } from 'react';
import type { NameShapingSelector } from './nameShapingConstants';
import type {
  NameShapingRawToken,
  NameShapingResolverCandidate,
  NameShapingState,
  NormalizedNameShapingSignature,
} from './nameShapingTypes';

const initialNameShapingState: NameShapingState = {
  enabled: false,
  rawEmittedSequence: [],
  normalizedSignature: [],
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

export interface NameShapingActions {
  enable: () => void;
  disable: () => void;
  clear: () => void;
  appendEmittedToken: (token: NameShapingRawToken) => void;
  setActiveSelector: (selector: NameShapingSelector | null) => void;
  commitBreak: () => void;
  setNormalizedSignature: (signature: NormalizedNameShapingSignature) => void;
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
    setState((prev) => ({
      ...prev,
      rawEmittedSequence: [...prev.rawEmittedSequence, token],
    }));
  }, []);

  const setActiveSelector = useCallback((selector: NameShapingSelector | null) => {
    setState((prev) => ({ ...prev, activeSelector: selector }));
  }, []);

  /** Append BREAK token; v1 no timestamp. */
  const commitBreak = useCallback(() => {
    setState((prev) => ({
      ...prev,
      rawEmittedSequence: [...prev.rawEmittedSequence, { selector: 'BREAK' }],
    }));
  }, []);

  const setNormalizedSignature = useCallback((signature: NormalizedNameShapingSignature) => {
    setState((prev) => ({ ...prev, normalizedSignature: [...signature] }));
  }, []);

  const setResolverCandidates = useCallback((candidates: readonly NameShapingResolverCandidate[]) => {
    setState((prev) => ({ ...prev, resolverCandidates: [...candidates] }));
  }, []);

  const setSelectedCandidate = useCallback((candidate: NameShapingResolverCandidate | null) => {
    setState((prev) => ({ ...prev, selectedCandidate: candidate }));
  }, []);

  const actions: NameShapingActions = {
    enable,
    disable,
    clear,
    appendEmittedToken,
    setActiveSelector,
    commitBreak,
    setNormalizedSignature,
    setResolverCandidates,
    setSelectedCandidate,
  };

  return { state, actions };
}
