import {
  getPlayActAccessibilityLabel,
  getPlayActPhaseCaptionText,
} from '../playActPhaseCopy';
import type { AgentPlayActResolution } from '../resolveAgentPlayAct';
import type { AgentOrchestratorState } from '../types';

function orch(over: Partial<AgentOrchestratorState>): AgentOrchestratorState {
  return {
    lifecycle: 'idle',
    processingSubstate: null,
    error: null,
    voiceReady: true,
    transcribedText: '',
    responseText: null,
    validationSummary: null,
    lastFrontDoorOutcome: null,
    ...over,
  };
}

function res(over: Partial<AgentPlayActResolution>): AgentPlayActResolution {
  return {
    primaryAct: 'intake',
    processingSubstate: null,
    affordanceHints: {
      voiceIntakeEligible: true,
      playbackGesturesEligible: false,
    },
    commitVisibilityHint: 'uncommitted_or_hidden',
    ...over,
  };
}

describe('getPlayActAccessibilityLabel', () => {
  it('uses orchestrator error lifecycle, not primaryAct intake', () => {
    const label = getPlayActAccessibilityLabel(
      res({ primaryAct: 'intake' }),
      orch({ lifecycle: 'error', error: 'Mic failed' }),
    );
    expect(label).toContain('Mic failed');
    expect(label.toLowerCase()).toContain('error');
  });

  it('Cycle 7: error lifecycle never implies voice intake even when intake act and hints say eligible', () => {
    const label = getPlayActAccessibilityLabel(
      res({
        primaryAct: 'intake',
        affordanceHints: {
          voiceIntakeEligible: true,
          playbackGesturesEligible: false,
        },
      }),
      orch({ lifecycle: 'error', error: 'Network error' }),
    );
    expect(label).toContain('Network error');
    expect(label).not.toContain('Awaiting voice');
  });

  it('uses generic error string when error lifecycle but empty message', () => {
    const label = getPlayActAccessibilityLabel(
      res({ primaryAct: 'intake' }),
      orch({ lifecycle: 'error', error: null }),
    );
    expect(label).toMatch(/error/i);
    expect(label).toContain('Voice or system');
  });

  it('maps evaluate act when not error', () => {
    expect(
      getPlayActAccessibilityLabel(
        res({
          primaryAct: 'evaluate',
          commitVisibilityHint: 'provisional',
        }),
        orch({ lifecycle: 'processing' }),
      ),
    ).toContain('Processing');
  });

  it('maps respond + speaking to playback copy', () => {
    expect(
      getPlayActAccessibilityLabel(
        res({ primaryAct: 'respond', commitVisibilityHint: 'committed_answer' }),
        orch({ lifecycle: 'speaking', responseText: 'Hi' }),
      ),
    ).toContain('Playing');
  });
});

describe('getPlayActPhaseCaptionText', () => {
  it('returns null on error lifecycle', () => {
    expect(
      getPlayActPhaseCaptionText(
        res({ primaryAct: 'recover' }),
        orch({ lifecycle: 'error', error: 'x' }),
      ),
    ).toBeNull();
  });

  it('returns short caption for clarify', () => {
    expect(
      getPlayActPhaseCaptionText(
        res({ primaryAct: 'clarify' }),
        orch({ lifecycle: 'idle' }),
      ),
    ).toContain('clearer');
  });
});
