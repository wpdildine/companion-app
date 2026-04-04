/**
 * RAG seam: classifies follow-up utterance relative to a runtime-proposed repair.
 * Not used by useAgentOrchestrator for interpretation — only invoked from ask() / executeRequest.
 */

import { normalizeDefault } from '@atlas/runtime';

export type RepairFollowUpKind =
  | 'confirm_repair'
  | 'reject_repair'
  | 'unrelated_new_query';

const CONFIRM_TOKENS = new Set([
  'yes',
  'y',
  'yeah',
  'yep',
  'sure',
  'ok',
  'okay',
  'confirm',
  'correct',
  'proceed',
]);

const REJECT_TOKENS = new Set([
  'no',
  'n',
  'nope',
  'cancel',
  'wrong',
  'reject',
  'stop',
]);

function norm(s: string): string {
  return normalizeDefault(s).toLowerCase();
}

/**
 * Deterministic classification for repair follow-up (runtime seam; not AO policy).
 */
export function classifyRepairFollowUp(
  userTranscript: string,
  repairedQuery: string,
): RepairFollowUpKind {
  const t = norm(userTranscript);
  if (!t) {
    return 'unrelated_new_query';
  }
  const rq = norm(repairedQuery);
  if (rq && t === rq) {
    return 'confirm_repair';
  }
  const words = t.split(/\s+/).filter(Boolean);
  const single = words.length === 1 ? words[0] : null;
  if (CONFIRM_TOKENS.has(t) || (single != null && CONFIRM_TOKENS.has(single))) {
    return 'confirm_repair';
  }
  if (REJECT_TOKENS.has(t) || (single != null && REJECT_TOKENS.has(single))) {
    return 'reject_repair';
  }
  return 'unrelated_new_query';
}
