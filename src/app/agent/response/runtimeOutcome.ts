/**
 * Lossless projection of runtime `SemanticFrontDoor` for the UX normalizer seam only.
 * No user-facing copy; no reinterpretation — see plan: `reason` is verbatim `transcript_decision` or omitted.
 */

import type { SemanticFrontDoor } from '@atlas/runtime';

/** Subset of runtime semantics carried forward without loss (per field). */
export type RuntimeOutcome = {
  /** `SemanticFrontDoor.front_door_verdict` */
  verdict: string;
  /** Verbatim `transcript_decision` (machine-readable union as string); omitted if absent from contract (should not happen). */
  reason?: string;
  /** Verbatim `resolver_mode`. */
  resolverMode?: string;
  /** Verbatim candidate names from `ambiguous_candidates[].name`. */
  candidates?: string[];
  /** Verbatim `resolver_query_norm` when present. */
  interpretedQuery?: string;
};

export function semanticFrontDoorToRuntimeOutcome(
  fd: SemanticFrontDoor,
): RuntimeOutcome {
  const outcome: RuntimeOutcome = {
    verdict: fd.front_door_verdict,
  };
  outcome.reason = fd.transcript_decision;
  outcome.resolverMode = fd.resolver_mode;
  if (fd.ambiguous_candidates && fd.ambiguous_candidates.length > 0) {
    outcome.candidates = fd.ambiguous_candidates.map(c => c.name);
  }
  if (fd.resolver_query_norm !== undefined && fd.resolver_query_norm.length > 0) {
    outcome.interpretedQuery = fd.resolver_query_norm;
  }
  return outcome;
}
