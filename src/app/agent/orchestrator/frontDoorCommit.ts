/**
 * Maps runtime `SemanticFrontDoor` to app-visible committed response text only.
 * No verdict policy — consumes `front_door_verdict` and typed fields from the payload.
 *
 * Cycle 6: blocked lanes do not restore a prior answer; abstain lanes commit no invented copy.
 */

import type { SemanticFrontDoor } from '@atlas/runtime';

/** Clarification text from resolver-supplied candidates; abstain uses empty committed text. */
export type FrontDoorCommitKind = 'clarify' | 'abstain';

export type CommittedFrontDoorResponse = {
  text: string;
  kind: FrontDoorCommitKind;
};

/**
 * Commits visible `responseText` for a front-door-blocked attempt.
 * - clarify_entity: join `ambiguous_candidates[].name` when present; else empty.
 * - abstain_*: empty string (recoverable signaling via listeners / lastFrontDoorOutcome).
 */
export function committedResponseFromSemanticFrontDoor(
  fd: SemanticFrontDoor,
): CommittedFrontDoorResponse {
  switch (fd.front_door_verdict) {
    case 'clarify_entity': {
      const names =
        fd.ambiguous_candidates?.map(c => c.name.trim()).filter(Boolean) ?? [];
      const text = names.join('\n');
      return { text, kind: 'clarify' };
    }
    case 'abstain_no_grounding':
    case 'abstain_transcript':
      return { text: '', kind: 'abstain' };
    case 'restates_request':
      throw new Error(
        'committedResponseFromSemanticFrontDoor: restates_request is handled in useAgentOrchestrator (scriptedResponses)',
      );
    case 'proceed_to_retrieval':
      throw new Error(
        'committedResponseFromSemanticFrontDoor: proceed_to_retrieval is not a blocked front-door outcome',
      );
    default: {
      const _exhaustive: never = fd.front_door_verdict;
      throw new Error(`Unexpected front_door_verdict: ${String(_exhaustive)}`);
    }
  }
}
