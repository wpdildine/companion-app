/**
 * Pure v1 seam: proposed answer-slot text for the settle path only.
 * Stateless; no I/O. Front-door UX is owned by `normalizeOutcomeToResponse`.
 */

import type { FailureIntent } from '@atlas/runtime';
import {
  INSUFFICIENT_CONTEXT_RESPONSES,
  pickRandomResponse,
} from './scriptedResponses';
import { SCRIPTED_EMPTY_OUTPUT_MESSAGE } from './v1Copy';

export type ScriptedAnswerSlotSettleInput = {
  path: 'settle';
  /** Raw `nudged` from RAG; empty trim selects empty-output canonical copy. */
  nudgedRaw: string;
  /** Runtime `AskResult.failure_intent`; replaces sentinel with scripted line only. */
  failureIntent?: FailureIntent | null;
};

export function resolveScriptedAnswerSlot(
  input: ScriptedAnswerSlotSettleInput,
): string {
  if (input.failureIntent === 'insufficient_context') {
    const line =
      pickRandomResponse(INSUFFICIENT_CONTEXT_RESPONSES).trim() ||
      INSUFFICIENT_CONTEXT_RESPONSES[0] ||
      '';
    return line.length > 0 ? line : SCRIPTED_EMPTY_OUTPUT_MESSAGE;
  }

  const n = input.nudgedRaw;
  if (n.trim().length > 0) {
    return n;
  }
  return SCRIPTED_EMPTY_OUTPUT_MESSAGE;
}
