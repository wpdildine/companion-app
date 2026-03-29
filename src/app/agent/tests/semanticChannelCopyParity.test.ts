/**
 * Parity: canonical semantic-channel copy vs legacy resolver + shim entry points.
 * Matrix: docs/semanticChannelCopyParity.matrix.md
 */

import type { SemanticFrontDoor } from '@atlas/runtime';
import { getSemanticEvidence } from '../getSemanticEvidence';
import {
  deriveSemanticChannelCopyCore,
  getSemanticChannelAccessibilityLabel,
  getSemanticChannelPhaseCaptionText,
  mapSemanticChannelPhaseCaptionText,
} from '../semanticChannelCanonicalCopy';
import { getPlayActAccessibilityLabel, getPlayActPhaseCaptionText } from '../playActPhaseCopy';
import { resolveActDescriptor } from '../resolveActDescriptor';
import { resolveAgentPlayAct } from '../resolveAgentPlayAct';
import type { AgentOrchestratorState } from '../types';
import type { SemanticSurfaceState } from '../semanticEvidenceTypes';

function fd(verdict: SemanticFrontDoor['front_door_verdict']): SemanticFrontDoor {
  return {
    contract_version: 1,
    working_query: 'q',
    resolver_mode: 'resolved',
    transcript_decision: 'pass_through',
    front_door_verdict: verdict,
  };
}

function baseSurface(over: Partial<SemanticSurfaceState> = {}): SemanticSurfaceState {
  return {
    interactionBandEnabled: true,
    activeInteractionOwner: 'none',
    revealedBlocks: {
      answer: false,
      cards: false,
      rules: false,
      sources: false,
    },
    debugEnabled: false,
    ...over,
  };
}

function evidenceFor(
  orch: AgentOrchestratorState,
  surface: SemanticSurfaceState = baseSurface(),
  observedEvents: import('../semanticEvidenceTypes').ObservedEvent[] = [],
) {
  const semanticEvidence = getSemanticEvidence({
    orchestratorState: orch,
    surfaceState: surface,
    observedEvents,
    presentation: {},
  });
  return {
    semanticEvidence,
    act: resolveActDescriptor(semanticEvidence),
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

function expectParity(
  orch: AgentOrchestratorState,
  surface: SemanticSurfaceState = baseSurface(),
  observedEvents: import('../semanticEvidenceTypes').ObservedEvent[] = [],
) {
  const { semanticEvidence, act } = evidenceFor(orch, surface, observedEvents);
  const resolution = resolveAgentPlayAct(orch, {
    interactionBandEnabled: surface.interactionBandEnabled,
  });

  expect(deriveSemanticChannelCopyCore(orch)).toEqual({
    primaryAct: resolution.primaryAct,
    processingSubstate: resolution.processingSubstate,
    commitVisibilityHint: resolution.commitVisibilityHint,
  });

  const legacyLabel = getPlayActAccessibilityLabel(resolution, orch);
  const legacyCaption = getPlayActPhaseCaptionText(resolution, orch);
  expect(getSemanticChannelAccessibilityLabel(semanticEvidence, act)).toBe(
    legacyLabel,
  );
  expect(getSemanticChannelPhaseCaptionText(semanticEvidence, act)).toBe(
    legacyCaption,
  );
}

describe('semanticChannelCopyParity (matrix rows A–K)', () => {
  it('A: InputOpen / idle', () => {
    expectParity(base({ lifecycle: 'idle' }));
  });

  it('B: WorkInFlight / listening', () => {
    expectParity(base({ lifecycle: 'listening' }));
  });

  it('C: WorkInFlight / processing', () => {
    expectParity(
      base({
        lifecycle: 'processing',
        processingSubstate: 'streaming',
      }),
    );
  });

  it('D: speaking + committed response', () => {
    expectParity(
      base({
        lifecycle: 'speaking',
        responseText: 'hello',
      }),
    );
  });

  it('E: idle + committed response, no blockers', () => {
    expectParity(
      base({
        lifecycle: 'idle',
        responseText: 'answer',
      }),
    );
  });

  it('F: clarify_entity', () => {
    expectParity(
      base({
        lifecycle: 'idle',
        lastFrontDoorOutcome: {
          requestId: 1,
          semanticFrontDoor: fd('clarify_entity'),
        },
      }),
    );
  });

  it('G: abstain verdict (recover copy)', () => {
    expectParity(
      base({
        lifecycle: 'idle',
        responseText: 'stale',
        lastFrontDoorOutcome: {
          requestId: 2,
          semanticFrontDoor: fd('abstain_transcript'),
        },
      }),
    );
  });

  it('G: listener recoverable tail', () => {
    const t0 = Date.now();
    expectParity(
      base({ lifecycle: 'idle' }),
      baseSurface(),
      [
        { kind: 'onRequestStart', source: 'orchestrator', timestamp: t0 },
        {
          kind: 'onRecoverableFailure',
          source: 'orchestrator',
          timestamp: t0 + 1,
        },
      ],
    );
  });

  it('H: error lifecycle', () => {
    expectParity(
      base({
        lifecycle: 'error',
        error: 'voice failed',
      }),
    );
  });

  it('I: front-door non-clarify non-abstain (proceed) — copy stays intake', () => {
    expectParity(
      base({
        lifecycle: 'idle',
        lastFrontDoorOutcome: {
          requestId: 3,
          semanticFrontDoor: fd('proceed_to_retrieval'),
        },
      }),
    );
  });

  it('J: empty response intake', () => {
    expectParity(base({ lifecycle: 'idle', responseText: '' }));
  });

  it('K: respond + each commitVisibilityHint caption branch (mapper parity lock)', () => {
    const orch = base({ lifecycle: 'idle', responseText: 'x' });
    const hints = [
      'provisional',
      'cleared_or_empty',
      'supplemental_input_expected',
      'uncommitted_or_hidden',
      'committed_answer',
    ] as const;
    for (const commitVisibilityHint of hints) {
      const core = {
        primaryAct: 'respond' as const,
        processingSubstate: null,
        commitVisibilityHint,
      };
      const resolution = {
        ...core,
        affordanceHints: {
          voiceIntakeEligible: false,
          playbackGesturesEligible: true,
        },
      };
      expect(mapSemanticChannelPhaseCaptionText(core, orch)).toBe(
        getPlayActPhaseCaptionText(resolution, orch),
      );
    }
  });
});
