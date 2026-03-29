import type { ActDescriptor } from '../actDescriptorTypes';
import { ACT_DESCRIPTOR_SCHEMA_VERSION } from '../actDescriptorTypes';
import { getActDescriptorSemanticChannelHint } from '../actDescriptorSemanticChannelHint';
import { getSemanticEvidence } from '../getSemanticEvidence';
import { resolveActDescriptor } from '../resolveActDescriptor';
import type { AgentOrchestratorState } from '../types';

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

function actWithFamily(
  family: ActDescriptor['identity']['family'],
  inFlightBucket: ActDescriptor['semanticSituation']['inFlightBucket'] = 'none',
): ActDescriptor {
  return {
    identity: { family, schemaVersion: ACT_DESCRIPTOR_SCHEMA_VERSION },
    scene: {
      captureOriented: false,
      workInFlight: false,
      resultVisible: false,
      faultVisible: false,
    },
    semanticSituation: {
      lifecycle: 'idle',
      processingSubstate: null,
      outcomeProjection: null,
      inFlightBucket,
    },
    gestureMeanings: {},
    pathways: [],
    continuation: {
      mode: 'fresh_play',
      replacementHints: {
        activeRequestId: null,
        requestInFlight: false,
        playbackRequestId: null,
      },
    },
    affordances: [],
    presentationHints: {},
  };
}

describe('getActDescriptorSemanticChannelHint', () => {
  it('returns null when lifecycle is error', () => {
    expect(
      getActDescriptorSemanticChannelHint(
        actWithFamily('InputOpen'),
        baseState({ lifecycle: 'error', error: 'x' }),
      ),
    ).toBeNull();
  });

  it('InputOpen returns neutral readiness gloss', () => {
    const h = getActDescriptorSemanticChannelHint(
      actWithFamily('InputOpen'),
      baseState(),
    );
    expect(h).toContain('idle');
    expect(h).not.toMatch(/\b(Tap|Try|Open)\b/i);
  });

  it('WorkInFlight open_mic bucket', () => {
    expect(
      getActDescriptorSemanticChannelHint(
        actWithFamily('WorkInFlight', 'open_mic'),
        baseState({ lifecycle: 'listening' }),
      ),
    ).toContain('listening');
  });

  it('WorkInFlight awaiting_async bucket', () => {
    expect(
      getActDescriptorSemanticChannelHint(
        actWithFamily('WorkInFlight', 'awaiting_async'),
        baseState({ lifecycle: 'processing' }),
      ),
    ).toContain('prepared');
  });

  it('WorkInFlight none bucket', () => {
    const h = getActDescriptorSemanticChannelHint(
      actWithFamily('WorkInFlight', 'none'),
      baseState({ lifecycle: 'speaking' }),
    );
    expect(h).toBeTruthy();
    expect(h).not.toMatch(/\b(Tap|Try)\b/i);
  });

  it('ClarificationPending', () => {
    expect(
      getActDescriptorSemanticChannelHint(
        actWithFamily('ClarificationPending'),
        baseState(),
      ),
    ).toContain('specificity');
  });

  it('RecoverableSetback', () => {
    expect(
      getActDescriptorSemanticChannelHint(
        actWithFamily('RecoverableSetback'),
        baseState(),
      ),
    ).toContain('did not complete');
  });

  it('AnswerActive', () => {
    expect(
      getActDescriptorSemanticChannelHint(
        actWithFamily('AnswerActive'),
        baseState(),
      ),
    ).toContain('grounded answer');
  });

  it('SystemFault when not error lifecycle', () => {
    expect(
      getActDescriptorSemanticChannelHint(
        actWithFamily('SystemFault'),
        baseState({ lifecycle: 'idle' }),
      ),
    ).toContain('issue');
  });

  it('matches resolveActDescriptor + getSemanticEvidence pipeline for processing', () => {
    const orch = baseState({
      lifecycle: 'processing',
      processingSubstate: 'streaming',
      requestInFlight: true,
      activeRequestId: 1,
    });
    const input = {
      orchestratorState: orch,
      surfaceState: {
        interactionBandEnabled: false,
        activeInteractionOwner: 'none' as const,
        revealedBlocks: {
          answer: false,
          cards: false,
          rules: false,
          sources: false,
        },
        debugEnabled: false,
      },
      observedEvents: [],
    };
    const act = resolveActDescriptor(getSemanticEvidence(input));
    const hint = getActDescriptorSemanticChannelHint(act, orch);
    expect(hint).toContain('prepared');
  });
});
