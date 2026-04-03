/**
 * Orchestrator-authored copy for runtime-gated outcomes (no model).
 * Keys align with runtime `FailureIntent` — see runtime-ts SEMANTIC_FRONT_DOOR.md.
 */

import type { FailureIntent } from '@atlas/runtime';

export const RESTATES_REQUEST_RESPONSES: readonly string[] = [
  "I didn't quite catch that — can you ask it again?",
  'Can you rephrase that for me?',
  "I'm not sure I understood — try asking that another way.",
  'That sounded a bit off — can you say it again?',
  "I didn't get that clearly — give it another shot.",
];

export const AMBIGUOUS_ENTITY_RESPONSES: readonly string[] = [
  'Which one are you asking about?',
  'Can you clarify which card you mean?',
  'I see multiple matches—can you specify?',
];

export const INSUFFICIENT_CONTEXT_RESPONSES: readonly string[] = [
  "I'm missing some detail—can you rephrase that?",
  'Can you be a bit more specific?',
  "I don't have enough context—try asking again with more detail.",
];

export function scriptedResponsesForFailureIntent(
  fi: FailureIntent,
): readonly string[] {
  switch (fi) {
    case 'restate_request':
      return RESTATES_REQUEST_RESPONSES;
    case 'ambiguous_entity':
      return AMBIGUOUS_ENTITY_RESPONSES;
    case 'insufficient_context':
      return INSUFFICIENT_CONTEXT_RESPONSES;
    default: {
      const _exhaustive: never = fi;
      return _exhaustive;
    }
  }
}

export function pickRandomResponse(list: readonly string[]): string {
  if (list.length === 0) {
    return '';
  }
  const i = Math.floor(Math.random() * list.length);
  return list[i] ?? list[0]!;
}
