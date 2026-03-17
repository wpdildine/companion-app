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

/**
 * One stored entry in the proper-noun resolver index.
 * Symmetrical with buildCardNameSignature result; baseName supports resolver/debug (e.g. "Urza" vs "Urza's Tower").
 */
export interface ResolverIndexEntry {
  cardId: string;
  displayName: string;
  normalizedName: string;
  baseName: string;
  fullNameSignature: NormalizedNameShapingSignature;
  baseNameSignature: NormalizedNameShapingSignature;
}

/** Read-only query surface for the resolver index. Base-signature lookup only in Executable 3. */
export interface ResolverIndex {
  getCandidatesBySignature(signature: NormalizedNameShapingSignature): readonly ResolverIndexEntry[];
  getAllIndexedCards(): readonly ResolverIndexEntry[];
  getEntriesSharingSelectors(signature: NormalizedNameShapingSignature): readonly ResolverIndexEntry[];
  getIndexStats(): { entryCount: number; uniqueBaseSignatures: number };
  getDebugSample(limit?: number): ReadonlyArray<{
    displayName: string;
    normalizedName: string;
    baseName: string;
    baseNameSignature: NormalizedNameShapingSignature;
    cardId?: string;
  }>;
}

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
 * may be empty. committedSignature is the explicit resolver snapshot used by the
 * current paused prototype; live entry does not resolve automatically.
 */
export interface NameShapingState {
  enabled: boolean;
  rawEmittedSequence: readonly NameShapingRawToken[];
  /** Derived from rawEmittedSequence in feature-local state; empty until input exists. */
  normalizedSignature: NormalizedNameShapingSignature;
  /** Explicit snapshot for resolver execution; cleared whenever live input changes. */
  committedSignature: NormalizedNameShapingSignature;
  resolverCandidates: readonly NameShapingResolverCandidate[];
  selectedCandidate: NameShapingResolverCandidate | null;
  activeSelector: NameShapingSelector | null;
}
