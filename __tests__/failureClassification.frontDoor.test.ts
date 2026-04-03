import {
  classifyTerminalFailure,
  recoverableReasonKeyForFrontDoorVerdict,
} from '../src/app/agent/failureClassification';
import {
  CONTEXT_BUNDLE_ERROR,
  CONTEXT_RETRIEVAL_EMPTY,
} from '../src/rag/errors';

describe('failureClassification vs semantic front door', () => {
  it('classifies E_RETRIEVAL with context.retrieval_empty attribution as retrieval_empty_bundle', () => {
    const err = {
      code: 'E_RETRIEVAL' as const,
      message: 'Deterministic context provider returned empty bundle.',
      details: {
        attribution: { error_kind: CONTEXT_RETRIEVAL_EMPTY },
      },
    };
    const c = classifyTerminalFailure(err);
    expect(c.kind).toBe('retrieval_empty_bundle');
  });

  it('does not infer retrieval_empty_bundle from message text without attribution', () => {
    const err = Object.assign(
      new Error('Deterministic context provider returned empty bundle.'),
      { code: 'E_RETRIEVAL' },
    );
    const c = classifyTerminalFailure(err);
    expect(c.kind).toBe('retrieval_unavailable');
  });

  it('does not use retrieval_empty_bundle for other E_RETRIEVAL attribution kinds', () => {
    const err = {
      code: 'E_RETRIEVAL' as const,
      message: 'pack load failed',
      details: {
        attribution: { error_kind: CONTEXT_BUNDLE_ERROR },
      },
    };
    const c = classifyTerminalFailure(err);
    expect(c.kind).toBe('retrieval_unavailable');
  });

  it('does not use retrieval_empty_bundle for generic E_RETRIEVAL messages', () => {
    const err = Object.assign(new Error('pack load failed'), {
      code: 'E_RETRIEVAL',
    });
    const c = classifyTerminalFailure(err);
    expect(c.kind).toBe('retrieval_unavailable');
  });
});

describe('recoverableReasonKeyForFrontDoorVerdict', () => {
  it('preserves distinct telemetry keys for transcript vs no-grounding vs clarify', () => {
    const t = recoverableReasonKeyForFrontDoorVerdict('abstain_transcript');
    const ng = recoverableReasonKeyForFrontDoorVerdict('abstain_no_grounding');
    const cl = recoverableReasonKeyForFrontDoorVerdict('clarify_entity');
    expect(new Set([t, ng, cl]).size).toBe(3);
    expect(t).toBe('semanticFrontDoorTranscript');
    expect(ng).toBe('semanticFrontDoorNoGrounding');
    expect(cl).toBe('semanticFrontDoorClarify');
  });

  it('maps restates_request to semanticFrontDoorRestates', () => {
    expect(recoverableReasonKeyForFrontDoorVerdict('restates_request')).toBe(
      'semanticFrontDoorRestates',
    );
  });
});
