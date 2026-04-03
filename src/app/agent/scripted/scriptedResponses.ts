/**
 * Orchestrator-authored copy for runtime-gated outcomes (no model).
 * v6: `restates_request` — see runtime-ts SEMANTIC_FRONT_DOOR.md.
 */

export const RESTATES_REQUEST_RESPONSES: readonly string[] = [
  "I didn't quite catch that — can you ask it again?",
  'Can you rephrase that for me?',
  "I'm not sure I understood — try asking that another way.",
  'That sounded a bit off — can you say it again?',
  "I didn't get that clearly — give it another shot.",
];

export function pickRandomResponse(list: readonly string[]): string {
  if (list.length === 0) {
    return '';
  }
  const i = Math.floor(Math.random() * list.length);
  return list[i] ?? list[0]!;
}
