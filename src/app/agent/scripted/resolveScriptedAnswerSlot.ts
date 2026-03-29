/**
 * Pure v1 seam: proposed answer-slot text for approved commit insertion points only.
 * Stateless; no I/O. See ANSWER_RESOLUTION.md (W2 settle, W3 front-door).
 */

import {
  SCRIPTED_CLARIFY_ENTITY_PREFIX,
  SCRIPTED_EMPTY_OUTPUT_MESSAGE,
} from './v1Copy';

/** Aligns with `CommittedFrontDoorResponse.kind` from frontDoorCommit. */
export type ScriptedFrontDoorCommitKind = 'clarify' | 'abstain';

export type ScriptedAnswerSlotFrontDoorInput = {
  path: 'front_door';
  kind: ScriptedFrontDoorCommitKind;
  /** Draft from `committedResponseFromSemanticFrontDoor`. */
  draftText: string;
};

export type ScriptedAnswerSlotSettleInput = {
  path: 'settle';
  /** Raw `nudged` from RAG; empty trim selects empty-output canonical copy. */
  nudgedRaw: string;
};

export type ScriptedAnswerSlotInput =
  | ScriptedAnswerSlotFrontDoorInput
  | ScriptedAnswerSlotSettleInput;

export function resolveScriptedAnswerSlot(
  input: ScriptedAnswerSlotSettleInput,
): string;
export function resolveScriptedAnswerSlot(
  input: ScriptedAnswerSlotFrontDoorInput,
): string | null;
export function resolveScriptedAnswerSlot(
  input: ScriptedAnswerSlotInput,
): string | null {
  if (input.path === 'front_door') {
    if (input.kind === 'abstain') {
      return null;
    }
    const body = input.draftText.trim();
    if (!body) {
      return null;
    }
    return `${SCRIPTED_CLARIFY_ENTITY_PREFIX}${body}`;
  }

  const n = input.nudgedRaw;
  if (n.trim().length > 0) {
    return n;
  }
  return SCRIPTED_EMPTY_OUTPUT_MESSAGE;
}
