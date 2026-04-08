import type { FailureClassification } from '../failureClassification';
import {
  normalizeExecutionFailureToResponse,
  normalizeOutcomeToResponse,
  normalizeUnknownExecutionFailureToResponse,
  STUB_ABSTAIN_MESSAGE,
  STUB_CLARIFY_MESSAGE,
  STUB_ERROR_MESSAGE,
} from './normalizeOutcomeToResponse';

describe('normalizeOutcomeToResponse', () => {
  it('maps proceed_to_retrieval to answer with generation text', () => {
    const r = normalizeOutcomeToResponse(
      {
        verdict: 'proceed_to_retrieval',
        reason: 'pass_through',
        resolverMode: 'resolved',
      },
      'Generated',
    );
    expect(r.kind).toBe('answer');
    expect(r.message).toBe('Generated');
    expect(r.metadata.verdict).toBe('proceed_to_retrieval');
    expect(r.metadata.reason).toBe('pass_through');
  });

  it('maps clarify_* to clarify stub', () => {
    const r = normalizeOutcomeToResponse({
      verdict: 'clarify_entity',
      reason: 'pass_through',
      resolverMode: 'ambiguous',
    });
    expect(r.kind).toBe('clarify');
    expect(r.message).toBe(STUB_CLARIFY_MESSAGE);
  });

  it('maps abstain_* to abstain stub', () => {
    const r = normalizeOutcomeToResponse({
      verdict: 'abstain_no_grounding',
      reason: 'pass_through',
      resolverMode: 'none',
    });
    expect(r.kind).toBe('abstain');
    expect(r.message).toBe(STUB_ABSTAIN_MESSAGE);
  });

  it('maps restates_request and repair_request to clarify stub', () => {
    expect(
      normalizeOutcomeToResponse({
        verdict: 'restates_request',
        reason: 'pass_through',
        resolverMode: 'none',
      }).kind,
    ).toBe('clarify');
    expect(
      normalizeOutcomeToResponse({
        verdict: 'repair_request',
        reason: 'pass_through',
        resolverMode: 'none',
      }).message,
    ).toBe(STUB_CLARIFY_MESSAGE);
  });
});

describe('normalizeExecutionFailureToResponse', () => {
  it('uses telemetryReason verbatim in metadata.reason', () => {
    const c: FailureClassification = {
      kind: 'model_unavailable',
      stage: 'model',
      recoverability: 'terminal',
      transientEvent: 'terminalFail',
      telemetryReason: 'modelLoad',
    };
    const r = normalizeExecutionFailureToResponse(c);
    expect(r.kind).toBe('error');
    expect(r.message).toBe(STUB_ERROR_MESSAGE);
    expect(r.metadata.reason).toBe('modelLoad');
  });
});

describe('normalizeUnknownExecutionFailureToResponse', () => {
  it('uses given reason token', () => {
    const r = normalizeUnknownExecutionFailureToResponse('executeRequestThrown');
    expect(r.kind).toBe('error');
    expect(r.message).toBe(STUB_ERROR_MESSAGE);
    expect(r.metadata.reason).toBe('executeRequestThrown');
  });
});
