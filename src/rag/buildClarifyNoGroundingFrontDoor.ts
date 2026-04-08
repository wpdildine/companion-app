/**
 * App-layer post-`getContextRN` semantic front door: `clarify_no_grounding` + `clarification_prompt`.
 * Not emitted by `computeSemanticFrontDoor` (see pack_runtime SEMANTIC_FRONT_DOOR.md v11).
 */

import type { SemanticFrontDoor } from '@atlas/runtime';
import {
  SEMANTIC_FRONT_DOOR_CONTRACT_VERSION,
  failureIntentFromFrontDoorVerdict,
} from '@atlas/runtime';

/**
 * Predicate: routing produced no selected sections (routing_trace seam).
 *
 * This is NOT "bundle has no rules" or "empty context." `bundle.rules` may still be
 * non-empty (e.g. hard_includes) while `sections_selected` is [] — we still clarify.
 */
export function routingTraceHasEmptySelectedSections(
  bundle:
    | { routing_trace?: { sections_selected?: string[] } }
    | null
    | undefined,
): boolean {
  const sel = bundle?.routing_trace?.sections_selected;
  return Array.isArray(sel) && sel.length === 0;
}

function formatCardList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]!} and ${names[1]!}`;
  const head = names.slice(0, -1).join(', ');
  return `${head}, and ${names[names.length - 1]!}`;
}

export function buildClarificationPromptText(cardNames: string[]): string {
  const list = formatCardList(cardNames);
  if (list.length > 0) {
    return (
      `I can see you're asking about how ${list} interact, but I don't have enough rules context to narrow this to a specific interaction.\n\n` +
      `Are you asking about:\n` +
      `- how protection affects targeting or resolution?\n` +
      `- how replacement or prevention effects apply?\n` +
      `- something else about the interaction?`
    );
  }
  return (
    `I don't have enough rules context to answer that yet.\n\n` +
      `Are you asking about:\n` +
      `- how protection affects targeting or resolution?\n` +
      `- how replacement or prevention effects apply?\n` +
      `- something else?`
  );
}

export function buildClarifyNoGroundingSemanticFrontDoor(
  base: SemanticFrontDoor,
  _bundle: { cards?: Array<{ name?: string }> } | null | undefined,
): SemanticFrontDoor {
  /** UX copy lives in app `normalizeOutcomeToResponse`; runtime carries verdict only. */
  const clarification_prompt = '';
  return {
    contract_version: SEMANTIC_FRONT_DOOR_CONTRACT_VERSION,
    working_query: base.working_query,
    resolver_mode: base.resolver_mode,
    transcript_decision: base.transcript_decision,
    front_door_verdict: 'clarify_no_grounding',
    failure_intent: failureIntentFromFrontDoorVerdict('clarify_no_grounding'),
    oracle_query_shape: base.oracle_query_shape,
    resolver_query_norm: base.resolver_query_norm,
    ambiguous_candidates: base.ambiguous_candidates,
    routing_readiness: { sections_selected: [] },
    clarification_prompt,
    case_id: base.case_id,
    run_id: base.run_id,
    correlation_id: base.correlation_id,
    request_id: base.request_id,
  };
}
