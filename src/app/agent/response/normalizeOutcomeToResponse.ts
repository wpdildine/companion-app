/**
 * Centralized UX mapping from lossless `RuntimeOutcome` (and execution failure) to a single response slot.
 * All user-facing strings are stubs here — replaceable without touching runtime semantics.
 */

import type { FailureClassification } from '../failureClassification';
import type { RuntimeOutcome } from './runtimeOutcome';

export type NormalizedResponseKind = 'answer' | 'clarify' | 'abstain' | 'error';

export type NormalizedResponse = {
  kind: NormalizedResponseKind;
  message: string;
  metadata: {
    verdict?: string;
    reason?: string;
  };
};

export const STUB_CLARIFY_MESSAGE =
  '[Clarification needed — placeholder until UX copy is finalized.]';
export const STUB_ABSTAIN_MESSAGE =
  '[No grounded answer — placeholder until UX copy is finalized.]';
export const STUB_ERROR_MESSAGE =
  '[Something went wrong — placeholder until UX copy is finalized.]';

function metadataFromRuntimeOutcome(o: RuntimeOutcome): NormalizedResponse['metadata'] {
  return {
    verdict: o.verdict,
    ...(o.reason !== undefined ? { reason: o.reason } : {}),
  };
}

/**
 * Pure verdict → UX kind + stub (or generation text for proceed). No semantic inference beyond string prefix rules.
 * `restates_request` / `repair_request`: mapped to clarify + stub (blocked / repair-adjacent; same stub family as clarify_*).
 */
export function normalizeOutcomeToResponse(
  outcome: RuntimeOutcome,
  generationText?: string,
): NormalizedResponse {
  const v = outcome.verdict;
  const meta = metadataFromRuntimeOutcome(outcome);

  if (v === 'proceed_to_retrieval') {
    return {
      kind: 'answer',
      message: generationText ?? '',
      metadata: meta,
    };
  }
  if (v.startsWith('clarify')) {
    return {
      kind: 'clarify',
      message: STUB_CLARIFY_MESSAGE,
      metadata: meta,
    };
  }
  if (v.startsWith('abstain')) {
    return {
      kind: 'abstain',
      message: STUB_ABSTAIN_MESSAGE,
      metadata: meta,
    };
  }
  if (v === 'restates_request' || v === 'repair_request') {
    return {
      kind: 'clarify',
      message: STUB_CLARIFY_MESSAGE,
      metadata: meta,
    };
  }
  return {
    kind: 'error',
    message: STUB_ERROR_MESSAGE,
    metadata: {
      verdict: v,
      ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
    },
  };
}

/** `FailureClassification.telemetryReason` is copied verbatim into metadata.reason (machine-readable). */
export function normalizeExecutionFailureToResponse(
  classification: FailureClassification,
): NormalizedResponse {
  return {
    kind: 'error',
    message: STUB_ERROR_MESSAGE,
    metadata: {
      reason: classification.telemetryReason,
    },
  };
}

/** Catch / unknown paths: single stable machine-readable reason token. */
export function normalizeUnknownExecutionFailureToResponse(
  reason: string,
): NormalizedResponse {
  return {
    kind: 'error',
    message: STUB_ERROR_MESSAGE,
    metadata: { reason },
  };
}
