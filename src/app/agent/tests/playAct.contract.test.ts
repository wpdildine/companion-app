import {
  failureIntentFromFrontDoorVerdict,
  SEMANTIC_FRONT_DOOR_CONTRACT_VERSION,
  type SemanticFrontDoor,
} from '@atlas/runtime';
import { resolveAgentPlayAct } from '../resolveAgentPlayAct';
import type { AgentOrchestratorState } from '../types';

function fd(front_door_verdict: SemanticFrontDoor['front_door_verdict']): SemanticFrontDoor {
  return {
    contract_version: SEMANTIC_FRONT_DOOR_CONTRACT_VERSION,
    working_query: 'q',
    resolver_mode: 'resolved',
    transcript_decision: 'pass_through',
    front_door_verdict,
    failure_intent: failureIntentFromFrontDoorVerdict(front_door_verdict),
  };
}

function base(over: Partial<AgentOrchestratorState> = {}): AgentOrchestratorState {
  return {
    lifecycle: 'idle',
    processingSubstate: null,
    error: null,
    voiceReady: true,
    transcribedText: '',
    responseText: null,
    validationSummary: null,
    lastFrontDoorOutcome: null,
    activeRequestId: null,
    requestInFlight: false,
    playbackRequestId: null,
    ...over,
  };
}

describe('resolveAgentPlayAct', () => {
  it('maps processing to evaluate with substate echo', () => {
    const r = resolveAgentPlayAct(
      base({
        lifecycle: 'processing',
        processingSubstate: 'retrieving',
      }),
    );
    expect(r.primaryAct).toBe('evaluate');
    expect(r.processingSubstate).toBe('retrieving');
    expect(r.commitVisibilityHint).toBe('provisional');
    expect(r.affordanceHints.voiceIntakeEligible).toBe(false);
  });

  it('maps speaking to respond', () => {
    const r = resolveAgentPlayAct(
      base({
        lifecycle: 'speaking',
        responseText: 'hello',
      }),
    );
    expect(r.primaryAct).toBe('respond');
    expect(r.processingSubstate).toBeNull();
    expect(r.commitVisibilityHint).toBe('committed_answer');
    expect(r.affordanceHints.playbackGesturesEligible).toBe(true);
  });

  it('maps error lifecycle to intake with hints suppressed', () => {
    const r = resolveAgentPlayAct(
      base({
        lifecycle: 'error',
        error: 'voice failed',
      }),
    );
    expect(r.primaryAct).toBe('intake');
    expect(r.affordanceHints.voiceIntakeEligible).toBe(false);
    expect(r.affordanceHints.playbackGesturesEligible).toBe(false);
    expect(r.commitVisibilityHint).toBe('cleared_or_empty');
  });

  it('maps clarify_entity to clarify', () => {
    const r = resolveAgentPlayAct(
      base({
        lifecycle: 'idle',
        lastFrontDoorOutcome: { requestId: 1, semanticFrontDoor: fd('clarify_entity') },
      }),
    );
    expect(r.primaryAct).toBe('clarify');
    expect(r.commitVisibilityHint).toBe('supplemental_input_expected');
  });

  it('maps abstain verdicts to recover before idle+responseText', () => {
    const r = resolveAgentPlayAct(
      base({
        lifecycle: 'idle',
        responseText: 'stale',
        lastFrontDoorOutcome: { requestId: 2, semanticFrontDoor: fd('abstain_transcript') },
      }),
    );
    expect(r.primaryAct).toBe('recover');
    expect(r.commitVisibilityHint).toBe('cleared_or_empty');
  });

  it('maps idle with responseText to respond when no abstain', () => {
    const r = resolveAgentPlayAct(
      base({
        lifecycle: 'idle',
        responseText: 'answer',
      }),
    );
    expect(r.primaryAct).toBe('respond');
    expect(r.affordanceHints.playbackGesturesEligible).toBe(true);
  });

  it('defaults to intake for idle without blockers', () => {
    const r = resolveAgentPlayAct(base({ lifecycle: 'idle' }));
    expect(r.primaryAct).toBe('intake');
    expect(r.commitVisibilityHint).toBe('uncommitted_or_hidden');
    expect(r.affordanceHints.voiceIntakeEligible).toBe(true);
  });

  it('intersects voiceIntakeEligible when interactionBandEnabled is false', () => {
    const r = resolveAgentPlayAct(base({ lifecycle: 'listening' }), {
      interactionBandEnabled: false,
    });
    expect(r.primaryAct).toBe('intake');
    expect(r.affordanceHints.voiceIntakeEligible).toBe(false);
  });

  it('is deterministic for the same snapshot', () => {
    const s = base({
      lifecycle: 'processing',
      processingSubstate: 'streaming',
    });
    expect(JSON.stringify(resolveAgentPlayAct(s))).toBe(
      JSON.stringify(resolveAgentPlayAct(s)),
    );
  });
});
