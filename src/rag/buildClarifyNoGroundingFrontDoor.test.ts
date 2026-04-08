import {
  buildClarificationPromptText,
  buildClarifyNoGroundingSemanticFrontDoor,
  routingTraceHasEmptySelectedSections,
} from './buildClarifyNoGroundingFrontDoor';
import {
  failureIntentFromFrontDoorVerdict,
  SEMANTIC_FRONT_DOOR_CONTRACT_VERSION,
  type SemanticFrontDoor,
} from '@atlas/runtime';

function baseProceedFd(): SemanticFrontDoor {
  return {
    contract_version: SEMANTIC_FRONT_DOOR_CONTRACT_VERSION,
    working_query: 'How do these interact?',
    resolver_mode: 'resolved',
    transcript_decision: 'pass_through',
    front_door_verdict: 'proceed_to_retrieval',
    failure_intent: failureIntentFromFrontDoorVerdict('proceed_to_retrieval'),
    routing_readiness: { sections_selected: [] },
  };
}

describe('routingTraceHasEmptySelectedSections (predicate: no selected sections in routing_trace)', () => {
  it('is true only when sections_selected is an empty array', () => {
    expect(
      routingTraceHasEmptySelectedSections({
        routing_trace: { sections_selected: [] },
      }),
    ).toBe(true);
    expect(
      routingTraceHasEmptySelectedSections({
        routing_trace: { sections_selected: ['122'] },
      }),
    ).toBe(false);
    expect(routingTraceHasEmptySelectedSections({})).toBe(false);
    expect(routingTraceHasEmptySelectedSections(null)).toBe(false);
  });

  it('is true even when bundle.rules is non-empty (not an empty-bundle check)', () => {
    expect(
      routingTraceHasEmptySelectedSections({
        routing_trace: { sections_selected: [] },
        rules: [{ rule_id: '999.1' }],
      } as { routing_trace: { sections_selected: string[] }; rules: unknown[] }),
    ).toBe(true);
  });
});

describe('buildClarifyNoGroundingSemanticFrontDoor', () => {
  it('sets verdict, clarification_prompt, and empty sections_selected in routing_readiness', () => {
    const fd = buildClarifyNoGroundingSemanticFrontDoor(baseProceedFd(), {
      cards: [{ name: 'A' }, { name: 'B' }],
    });
    expect(fd.front_door_verdict).toBe('clarify_no_grounding');
    expect(fd.failure_intent).toBeNull();
    expect(fd.routing_readiness?.sections_selected).toEqual([]);
    expect(fd.clarification_prompt).toBe('');
    expect(fd.contract_version).toBe(SEMANTIC_FRONT_DOOR_CONTRACT_VERSION);
  });
});

describe('buildClarificationPromptText', () => {
  it('uses generic copy when there are no card names', () => {
    const t = buildClarificationPromptText([]);
    expect(t).toContain('enough rules context');
  });
});
