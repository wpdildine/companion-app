import { SEMANTIC_FRONT_DOOR_CONTRACT_VERSION } from '@atlas/runtime';
import { semanticFrontDoorToRuntimeOutcome } from './runtimeOutcome';

describe('semanticFrontDoorToRuntimeOutcome', () => {
  it('copies verdict, reason (transcript_decision), resolverMode, candidates, interpretedQuery verbatim', () => {
    const o = semanticFrontDoorToRuntimeOutcome({
      contract_version: SEMANTIC_FRONT_DOOR_CONTRACT_VERSION,
      working_query: 'q',
      resolver_mode: 'ambiguous',
      transcript_decision: 'pass_through',
      front_door_verdict: 'clarify_entity',
      failure_intent: 'ambiguous_entity',
      oracle_query_shape: 'none',
      ambiguous_candidates: [{ name: 'A' }, { name: 'B' }],
      resolver_query_norm: 'norm q',
      routing_readiness: { sections_selected: [] },
    });
    expect(o).toEqual({
      verdict: 'clarify_entity',
      reason: 'pass_through',
      resolverMode: 'ambiguous',
      candidates: ['A', 'B'],
      interpretedQuery: 'norm q',
    });
  });

  it('omits candidates and interpretedQuery when absent', () => {
    const o = semanticFrontDoorToRuntimeOutcome({
      contract_version: SEMANTIC_FRONT_DOOR_CONTRACT_VERSION,
      working_query: 'q',
      resolver_mode: 'none',
      transcript_decision: 'insufficient_signal',
      front_door_verdict: 'abstain_transcript',
      failure_intent: 'restate_request',
      oracle_query_shape: 'none',
      routing_readiness: { sections_selected: [] },
    });
    expect(o).toEqual({
      verdict: 'abstain_transcript',
      reason: 'insufficient_signal',
      resolverMode: 'none',
    });
  });
});
