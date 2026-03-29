import { getOutcomeProjection } from '../getOutcomeProjection';
import {
  buildAtlasSemanticChannelDebugSnapshot,
  getSemanticEvidence,
} from '../getSemanticEvidence';
import { resolveActDescriptor } from '../resolveActDescriptor';
import { mirrorRequestIdentityFromRefs } from '../semanticEvidenceMirror';
import {
  appendSemanticEvidenceEvent,
  SEMANTIC_EVIDENCE_DEFAULT_MAX_EVENTS,
} from '../semanticEvidenceSink';
import type { ObservedEvent, ObservedEventKind } from '../semanticEvidenceTypes';
import type { AgentOrchestratorState, LastFrontDoorOutcome } from '../types';

function baseState(
  over: Partial<AgentOrchestratorState> = {},
): AgentOrchestratorState {
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

describe('mirrorRequestIdentityFromRefs', () => {
  it('maps active 0 to null', () => {
    expect(mirrorRequestIdentityFromRefs(0, false, null)).toEqual({
      activeRequestId: null,
      requestInFlight: false,
      playbackRequestId: null,
    });
  });

  it('preserves non-zero active id and in-flight flag', () => {
    expect(mirrorRequestIdentityFromRefs(7, true, 7)).toEqual({
      activeRequestId: 7,
      requestInFlight: true,
      playbackRequestId: 7,
    });
  });
});

describe('appendSemanticEvidenceEvent', () => {
  it('caps buffer length', () => {
    const ref = { current: [] as ObservedEvent[] };
    const cap = 5;
    for (let i = 0; i < 10; i++) {
      appendSemanticEvidenceEvent(
        ref,
        { kind: `e${i}`, source: 'orchestrator' },
        cap,
      );
    }
    expect(ref.current.length).toBe(cap);
    expect(ref.current[0].kind).toBe('e5');
    expect(ref.current[cap - 1].kind).toBe('e9');
  });

  it('default max constant is 50', () => {
    expect(SEMANTIC_EVIDENCE_DEFAULT_MAX_EVENTS).toBe(50);
  });

  it('preserves append order after trim (FIFO)', () => {
    const ref = { current: [] as ObservedEvent[] };
    const cap = 4;
    const kinds = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
    for (const k of kinds) {
      appendSemanticEvidenceEvent(
        ref,
        { kind: k, source: 'orchestrator', timestamp: 0 },
        cap,
      );
    }
    expect(ref.current.map(e => e.kind)).toEqual(['c', 'd', 'e', 'f']);
  });
});

/** Compile-time anchor: catalogued kinds remain assignable to ObservedEventKind. */
const _observedKindSamples = [
  'onRequestStart',
  'onComplete',
  'hold_end',
  'tapCitation',
] as const satisfies readonly ObservedEventKind[];
void _observedKindSamples;

describe('getOutcomeProjection', () => {
  it('returns null for processing', () => {
    expect(
      getOutcomeProjection({
        lifecycle: 'processing',
        error: null,
        lastFrontDoorOutcome: null,
        observedEvents: [],
        hasCommittedResponse: false,
      }),
    ).toBeNull();
  });

  it('returns null for listening', () => {
    expect(
      getOutcomeProjection({
        lifecycle: 'listening',
        error: null,
        lastFrontDoorOutcome: null,
        observedEvents: [],
        hasCommittedResponse: false,
      }),
    ).toBeNull();
  });

  it('terminal for error lifecycle', () => {
    expect(
      getOutcomeProjection({
        lifecycle: 'error',
        error: 'Mic failed',
        lastFrontDoorOutcome: null,
        observedEvents: [],
        hasCommittedResponse: false,
      }),
    ).toEqual({ class: 'terminal', source: 'lifecycle' });
  });

  it('terminal for non-empty error string when lifecycle not error', () => {
    expect(
      getOutcomeProjection({
        lifecycle: 'idle',
        error: 'x',
        lastFrontDoorOutcome: null,
        observedEvents: [],
        hasCommittedResponse: false,
      }),
    ).toEqual({ class: 'terminal', source: 'error' });
  });

  it('blocked when lastFrontDoorOutcome set', () => {
    const fd = {
      requestId: 1,
      semanticFrontDoor: {
        contract_version: 1,
        working_query: 'q',
        resolver_mode: 'resolved' as const,
        transcript_decision: 'pass_through' as const,
        front_door_verdict: 'clarify_entity' as const,
      },
    } satisfies LastFrontDoorOutcome;
    expect(
      getOutcomeProjection({
        lifecycle: 'idle',
        error: null,
        lastFrontDoorOutcome: fd,
        observedEvents: [],
        hasCommittedResponse: true,
      }),
    ).toEqual({ class: 'blocked', source: 'frontDoor' });
  });

  it('recoverable when onRecoverableFailure after onRequestStart without onComplete after', () => {
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
        payload: { requestId: 1, reason: 'speech_no_transcript' },
      },
    ];
    expect(
      getOutcomeProjection({
        lifecycle: 'idle',
        error: null,
        lastFrontDoorOutcome: null,
        observedEvents: events,
        hasCommittedResponse: false,
      }),
    ).toEqual({ class: 'recoverable', source: 'listener' });
  });

  it('success when idle with committed response and no blocking outcome', () => {
    expect(
      getOutcomeProjection({
        lifecycle: 'idle',
        error: null,
        lastFrontDoorOutcome: null,
        observedEvents: [],
        hasCommittedResponse: true,
      }),
    ).toEqual({ class: 'success', source: 'lifecycle' });
  });

  it('success when speaking with committed response', () => {
    expect(
      getOutcomeProjection({
        lifecycle: 'speaking',
        error: null,
        lastFrontDoorOutcome: null,
        observedEvents: [],
        hasCommittedResponse: true,
      }),
    ).toEqual({ class: 'success', source: 'lifecycle' });
  });

  it('blocked takes precedence over recoverable listener tail', () => {
    const fd = {
      requestId: 1,
      semanticFrontDoor: {
        contract_version: 1,
        working_query: 'q',
        resolver_mode: 'resolved' as const,
        transcript_decision: 'pass_through' as const,
        front_door_verdict: 'clarify_entity' as const,
      },
    } satisfies LastFrontDoorOutcome;
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
    expect(
      getOutcomeProjection({
        lifecycle: 'idle',
        error: null,
        lastFrontDoorOutcome: fd,
        observedEvents: events,
        hasCommittedResponse: false,
      }),
    ).toEqual({ class: 'blocked', source: 'frontDoor' });
  });

  it('non-empty error takes precedence over front door outcome', () => {
    const fd = {
      requestId: 1,
      semanticFrontDoor: {
        contract_version: 1,
        working_query: 'q',
        resolver_mode: 'resolved' as const,
        transcript_decision: 'pass_through' as const,
        front_door_verdict: 'clarify_entity' as const,
      },
    } satisfies LastFrontDoorOutcome;
    expect(
      getOutcomeProjection({
        lifecycle: 'idle',
        error: 'network',
        lastFrontDoorOutcome: fd,
        observedEvents: [],
        hasCommittedResponse: true,
      }),
    ).toEqual({ class: 'terminal', source: 'error' });
  });

  it('error lifecycle takes precedence over success-shaped fields', () => {
    expect(
      getOutcomeProjection({
        lifecycle: 'error',
        error: null,
        lastFrontDoorOutcome: null,
        observedEvents: [],
        hasCommittedResponse: true,
      }),
    ).toEqual({ class: 'terminal', source: 'lifecycle' });
  });

  it('null when idle with no response and no recoverable tail', () => {
    expect(
      getOutcomeProjection({
        lifecycle: 'idle',
        error: null,
        lastFrontDoorOutcome: null,
        observedEvents: [],
        hasCommittedResponse: false,
      }),
    ).toBeNull();
  });

  it('not recoverable when onComplete follows onRecoverableFailure after same request start', () => {
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
      {
        kind: 'onComplete',
        source: 'orchestrator',
        timestamp: 3,
        payload: { requestId: 1 },
      },
    ];
    expect(
      getOutcomeProjection({
        lifecycle: 'idle',
        error: null,
        lastFrontDoorOutcome: null,
        observedEvents: events,
        hasCommittedResponse: true,
      }),
    ).toEqual({ class: 'success', source: 'lifecycle' });
  });
});

describe('getSemanticEvidence', () => {
  it('aggregates identity from orchestrator state and outcome', () => {
    const orch = baseState({
      lifecycle: 'idle',
      responseText: 'hi',
      activeRequestId: null,
      requestInFlight: false,
      playbackRequestId: null,
    });
    const se = getSemanticEvidence({
      orchestratorState: orch,
      surfaceState: {
        interactionBandEnabled: true,
        activeInteractionOwner: 'none',
        revealedBlocks: {
          answer: false,
          cards: false,
          rules: false,
          sources: false,
        },
        debugEnabled: false,
      },
      observedEvents: [],
      presentation: { playActAccessibilityLabel: 'x' },
    });
    expect(se.identity).toEqual({
      activeRequestId: null,
      requestInFlight: false,
      playbackRequestId: null,
    });
    expect(se.outcome).toEqual({ class: 'success', source: 'lifecycle' });
    expect(se.presentation.playActAccessibilityLabel).toBe('x');
  });

  it('identity slice always matches orchestrator state request fields', () => {
    const orch = baseState({
      activeRequestId: 42,
      requestInFlight: true,
      playbackRequestId: 42,
      lifecycle: 'processing',
      responseText: null,
    });
    const se = getSemanticEvidence({
      orchestratorState: orch,
      surfaceState: {
        interactionBandEnabled: true,
        activeInteractionOwner: 'none',
        revealedBlocks: {
          answer: false,
          cards: false,
          rules: false,
          sources: false,
        },
        debugEnabled: false,
      },
      observedEvents: [],
    });
    expect(se.identity).toEqual({
      activeRequestId: orch.activeRequestId,
      requestInFlight: orch.requestInFlight,
      playbackRequestId: orch.playbackRequestId,
    });
    expect(se.runtime.activeRequestId).toBe(se.identity.activeRequestId);
    expect(se.outcome).toBeNull();
  });

  it('copies observed events in order and derives outcome from them', () => {
    const observed: ObservedEvent[] = [
      {
        kind: 'onRequestStart',
        source: 'orchestrator',
        timestamp: 10,
        payload: { requestId: 1 },
      },
      {
        kind: 'onRecoverableFailure',
        source: 'orchestrator',
        timestamp: 20,
        payload: { requestId: 1 },
      },
    ];
    const se = getSemanticEvidence({
      orchestratorState: baseState({
        lifecycle: 'idle',
        responseText: null,
      }),
      surfaceState: {
        interactionBandEnabled: true,
        activeInteractionOwner: 'none',
        revealedBlocks: {
          answer: false,
          cards: false,
          rules: false,
          sources: false,
        },
        debugEnabled: false,
      },
      observedEvents: observed,
    });
    expect(se.interaction.observedEvents).toEqual(observed);
    expect(se.interaction.observedEvents).not.toBe(observed);
    expect(se.outcome).toEqual({ class: 'recoverable', source: 'listener' });
  });
});

describe('buildAtlasSemanticChannelDebugSnapshot', () => {
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

  it('actDescriptor matches resolveActDescriptor on the bundled semanticEvidence', () => {
    const input = {
      orchestratorState: baseState({
        lifecycle: 'processing',
        processingSubstate: 'streaming',
        requestInFlight: true,
        activeRequestId: 9,
      }),
      surfaceState: defaultSurface,
      observedEvents: [] as const,
    };
    const snap = buildAtlasSemanticChannelDebugSnapshot(input);
    expect(snap.semanticEvidence).toEqual(getSemanticEvidence(input));
    expect(snap.actDescriptor).toEqual(
      resolveActDescriptor(snap.semanticEvidence),
    );
  });
});
