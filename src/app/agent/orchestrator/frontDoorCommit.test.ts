import { committedResponseFromSemanticFrontDoor } from './frontDoorCommit';
import {
  failureIntentFromFrontDoorVerdict,
  SEMANTIC_FRONT_DOOR_CONTRACT_VERSION,
  type SemanticFrontDoor,
} from '@atlas/runtime';

function baseFd(
  overrides: Partial<SemanticFrontDoor> & Pick<SemanticFrontDoor, 'front_door_verdict'>,
): SemanticFrontDoor {
  const { front_door_verdict, failure_intent: fiOverride, ...rest } = overrides;
  return {
    contract_version: SEMANTIC_FRONT_DOOR_CONTRACT_VERSION,
    working_query: 'q',
    resolver_mode: 'none',
    transcript_decision: 'pass_through',
    routing_readiness: { sections_selected: [] },
    front_door_verdict,
    failure_intent:
      fiOverride ?? failureIntentFromFrontDoorVerdict(front_door_verdict),
    ...rest,
  } as SemanticFrontDoor;
}

describe('committedResponseFromSemanticFrontDoor', () => {
  it('joins ambiguous candidate names for clarify_entity', () => {
    const r = committedResponseFromSemanticFrontDoor(
      baseFd({
        front_door_verdict: 'clarify_entity',
        resolver_mode: 'ambiguous',
        ambiguous_candidates: [{ name: 'A' }, { name: 'B' }],
      }),
    );
    expect(r).toEqual({ kind: 'clarify', text: 'A\nB' });
  });

  it('returns empty clarify text when no candidates', () => {
    const r = committedResponseFromSemanticFrontDoor(
      baseFd({
        front_door_verdict: 'clarify_entity',
        resolver_mode: 'ambiguous',
        ambiguous_candidates: [],
      }),
    );
    expect(r).toEqual({ kind: 'clarify', text: '' });
  });

  it('abstain_no_grounding yields abstain kind and empty text', () => {
    const r = committedResponseFromSemanticFrontDoor(
      baseFd({
        front_door_verdict: 'abstain_no_grounding',
      }),
    );
    expect(r).toEqual({ kind: 'abstain', text: '' });
  });

  it('abstain_transcript yields abstain kind and empty text', () => {
    const r = committedResponseFromSemanticFrontDoor(
      baseFd({
        front_door_verdict: 'abstain_transcript',
        transcript_decision: 'insufficient_signal',
      }),
    );
    expect(r).toEqual({ kind: 'abstain', text: '' });
  });

  it('throws for proceed_to_retrieval', () => {
    expect(() =>
      committedResponseFromSemanticFrontDoor(
        baseFd({
          front_door_verdict: 'proceed_to_retrieval',
        }),
      ),
    ).toThrow(/proceed_to_retrieval/);
  });

  it('throws for restates_request (orchestrator owns scripted copy)', () => {
    expect(() =>
      committedResponseFromSemanticFrontDoor(
        baseFd({
          front_door_verdict: 'restates_request',
        }),
      ),
    ).toThrow(/restates_request/);
  });
});
