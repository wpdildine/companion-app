import { ACT_PATHWAY_TAGS_ALL } from '../actDescriptorTypes';
import { getSemanticEvidence } from '../getSemanticEvidence';
import {
  resolveActDescriptor,
  validateActDescriptorCoherence,
} from '../resolveActDescriptor';
import type { ObservedEvent } from '../semanticEvidenceTypes';
import type { AgentOrchestratorState, LastFrontDoorOutcome } from '../types';

function baseOrch(over: Partial<AgentOrchestratorState> = {}): AgentOrchestratorState {
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

const defaultSurface = {
  interactionBandEnabled: true,
  activeInteractionOwner: 'none' as const,
  revealedBlocks: {
    answer: false,
    cards: false,
    rules: false,
    sources: false,
  },
  debugEnabled: false,
};

describe('resolveActDescriptor', () => {
  it('is pure: same evidence yields same descriptor', () => {
    const orch = baseOrch({ lifecycle: 'processing', processingSubstate: 'streaming' });
    const se = getSemanticEvidence({
      orchestratorState: orch,
      surfaceState: defaultSurface,
      observedEvents: [],
    });
    const a = resolveActDescriptor(se);
    const b = resolveActDescriptor(se);
    expect(a).toEqual(b);
  });

  it('maps terminal outcome to SystemFault with fault pathways', () => {
    const orch = baseOrch({ lifecycle: 'error', error: 'x' });
    const se = getSemanticEvidence({
      orchestratorState: orch,
      surfaceState: defaultSurface,
      observedEvents: [],
    });
    const act = resolveActDescriptor(se);
    expect(act.identity.family).toBe('SystemFault');
    expect(act.continuation.mode).toBe('terminal');
    expect(act.scene.faultVisible).toBe(true);
    expect(act.pathways.map(p => p.tag)).toEqual(
      expect.arrayContaining(['surface_fault', 'no_normal_path']),
    );
    expect(validateActDescriptorCoherence(se, act)).toEqual([]);
  });

  it('maps blocked front door to ClarificationPending', () => {
    const fd = {
      requestId: 1,
      semanticFrontDoor: {
        contract_version: 11,
        working_query: 'q',
        resolver_mode: 'resolved' as const,
        transcript_decision: 'pass_through' as const,
        front_door_verdict: 'clarify_entity' as const,
        failure_intent: 'ambiguous_entity' as const,
      },
    } satisfies LastFrontDoorOutcome;
    const orch = baseOrch({ lastFrontDoorOutcome: fd });
    const se = getSemanticEvidence({
      orchestratorState: orch,
      surfaceState: defaultSurface,
      observedEvents: [],
    });
    const act = resolveActDescriptor(se);
    expect(act.identity.family).toBe('ClarificationPending');
    expect(act.continuation.mode).toBe('blocked_path');
    expect(act.pathways.map(p => p.tag)).toEqual(
      expect.arrayContaining([
        'supplement_input',
        'blocked_until_resolution',
        'start_fresh_play',
      ]),
    );
    expect(validateActDescriptorCoherence(se, act)).toEqual([]);
  });

  it('maps recoverable listener tail to RecoverableSetback', () => {
    const events: ObservedEvent[] = [
      {
        kind: 'onRequestStart',
        source: 'orchestrator',
        timestamp: 1,
        payload: { requestId: 1 },
      },
      {
        kind: 'onRecoverableFailure',
        source: 'orchestrator',
        timestamp: 2,
        payload: { requestId: 1 },
      },
    ];
    const orch = baseOrch({ lifecycle: 'idle' });
    const se = getSemanticEvidence({
      orchestratorState: orch,
      surfaceState: defaultSurface,
      observedEvents: events,
    });
    const act = resolveActDescriptor(se);
    expect(act.identity.family).toBe('RecoverableSetback');
    expect(act.continuation.mode).toBe('post_recover_retry');
    expect(act.pathways.map(p => p.tag)).toEqual(
      expect.arrayContaining(['retry_after_recovery', 'continue_input']),
    );
    expect(validateActDescriptorCoherence(se, act)).toEqual([]);
  });

  it('maps processing to WorkInFlight and awaiting_async bucket', () => {
    const orch = baseOrch({
      lifecycle: 'processing',
      processingSubstate: 'retrieving',
      requestInFlight: true,
      activeRequestId: 3,
    });
    const se = getSemanticEvidence({
      orchestratorState: orch,
      surfaceState: defaultSurface,
      observedEvents: [],
    });
    const act = resolveActDescriptor(se);
    expect(act.identity.family).toBe('WorkInFlight');
    expect(act.semanticSituation.inFlightBucket).toBe('awaiting_async');
    expect(act.continuation.mode).toBe('same_request_continuation');
    expect(act.pathways.map(p => p.tag)).toContain('wait_for_async_completion');
    expect(act.gestureMeanings.holdToSpeak).toBe('unavailable_for_interpretation');
  });

  it('maps listening to WorkInFlight with continue_input pathway', () => {
    const orch = baseOrch({ lifecycle: 'listening' });
    const se = getSemanticEvidence({
      orchestratorState: orch,
      surfaceState: {
        ...defaultSurface,
        activeInteractionOwner: 'holdToSpeak',
      },
      observedEvents: [],
    });
    const act = resolveActDescriptor(se);
    expect(act.identity.family).toBe('WorkInFlight');
    expect(act.semanticSituation.inFlightBucket).toBe('open_mic');
    expect(act.pathways.map(p => p.tag)).toContain('continue_input');
    expect(act.gestureMeanings.holdToSpeak).toBe('primary_utterance');
  });

  it('maps success outcome to AnswerActive and reveal pathway when panels hidden', () => {
    const orch = baseOrch({
      lifecycle: 'idle',
      responseText: 'hello',
    });
    const se = getSemanticEvidence({
      orchestratorState: orch,
      surfaceState: defaultSurface,
      observedEvents: [],
    });
    const act = resolveActDescriptor(se);
    expect(act.identity.family).toBe('AnswerActive');
    expect(act.continuation.mode).toBe('answer_retention');
    expect(act.scene.resultVisible).toBe(true);
    expect(act.pathways.map(p => p.tag)).toContain('consume_answer');
    expect(act.pathways.map(p => p.tag)).toContain('reveal_supporting_material');
    expect(act.gestureMeanings.playbackTap).toBe('replay_or_navigate_answer');
    expect(validateActDescriptorCoherence(se, act)).toEqual([]);
  });

  it('maps idle without outcome to InputOpen', () => {
    const orch = baseOrch({ lifecycle: 'idle' });
    const se = getSemanticEvidence({
      orchestratorState: orch,
      surfaceState: defaultSurface,
      observedEvents: [],
    });
    const act = resolveActDescriptor(se);
    expect(act.identity.family).toBe('InputOpen');
    expect(act.continuation.mode).toBe('fresh_play');
    expect(act.semanticSituation.inFlightBucket).toBe('none');
    expect(act.pathways.map(p => p.tag)).toEqual(
      expect.arrayContaining(['continue_input', 'start_fresh_play']),
    );
  });

  it('does not collapse to family only: pathways and gestures populated for InputOpen', () => {
    const se = getSemanticEvidence({
      orchestratorState: baseOrch({ lifecycle: 'idle' }),
      surfaceState: defaultSurface,
      observedEvents: [],
    });
    const act = resolveActDescriptor(se);
    expect(act.pathways.length).toBeGreaterThan(0);
    expect(Object.keys(act.gestureMeanings).length).toBeGreaterThan(0);
    expect(act.affordances.length).toBeGreaterThan(0);
  });

  it('downgrades hold when band disabled', () => {
    const se = getSemanticEvidence({
      orchestratorState: baseOrch({ lifecycle: 'idle' }),
      surfaceState: { ...defaultSurface, interactionBandEnabled: false },
      observedEvents: [],
    });
    const act = resolveActDescriptor(se);
    expect(act.gestureMeanings.holdToSpeak).toBe('unavailable_for_interpretation');
  });

  it('flags gesture incoherence when overlay owns interaction but hold is primary', () => {
    const se = getSemanticEvidence({
      orchestratorState: baseOrch({ lifecycle: 'idle' }),
      surfaceState: { ...defaultSurface, activeInteractionOwner: 'overlay' },
      observedEvents: [],
    });
    const act = resolveActDescriptor(se);
    expect(act.gestureMeanings.holdToSpeak).toBe('unavailable_for_interpretation');
    const bad = {
      ...act,
      gestureMeanings: { ...act.gestureMeanings, holdToSpeak: 'primary_utterance' as const },
    };
    const issues = validateActDescriptorCoherence(se, bad);
    expect(issues.some(i => i.code === 'gesture_hold_arbitration')).toBe(true);
  });

  it('passthrough presentation hints from SemanticEvidence', () => {
    const se = getSemanticEvidence({
      orchestratorState: baseOrch(),
      surfaceState: defaultSurface,
      observedEvents: [],
      presentation: {
        playActAccessibilityLabel: 'a11y',
        playActPhaseCaptionText: 'caption',
      },
    });
    const act = resolveActDescriptor(se);
    expect(act.presentationHints).toEqual({
      playActAccessibilityLabel: 'a11y',
      playActPhaseCaptionText: 'caption',
    });
  });

  it('registry lists all pathway tags', () => {
    expect(ACT_PATHWAY_TAGS_ALL.length).toBe(10);
  });
});
