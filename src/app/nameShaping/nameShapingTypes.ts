/**
 * Name Shaping: emitted token, signature, resolver candidate, and runtime state types.
 * Shape only; no normalization logic or behavior in this layer.
 */

import type { NameShapingSelector } from './nameShapingConstants';

/** Single raw emitted selector token. Order and repetition preserved in sequences. */
export interface NameShapingRawToken {
  selector: NameShapingSelector;
  /** Optional; for debug/timing only. */
  timestamp?: number;
}

/**
 * Normalized selector signature: ordered readonly array of selectors.
 * For Executable 1, normalized signatures may still include BREAK until a later
 * normalization executable defines stricter rules. Shape only; no normalization
 * guarantees in this executable.
 */
export type NormalizedNameShapingSignature = readonly NameShapingSelector[];

/** One candidate from the proper-name resolver. */
export interface NameShapingResolverCandidate {
  cardId: string;
  displayName: string;
  score: number;
  signature: NormalizedNameShapingSignature;
  matchReason?: string;
}

/**
 * Name Shaping runtime state. normalizedSignature is shape only; initial value
 * may be empty; no normalization guarantees in this executable.
 */
export interface NameShapingState {
  enabled: boolean;
  rawEmittedSequence: readonly NameShapingRawToken[];
  /** Shape only; initial value may be empty; no normalization guarantees in this executable. */
  normalizedSignature: NormalizedNameShapingSignature;
  resolverCandidates: readonly NameShapingResolverCandidate[];
  selectedCandidate: NameShapingResolverCandidate | null;
  activeSelector: NameShapingSelector | null;
}
