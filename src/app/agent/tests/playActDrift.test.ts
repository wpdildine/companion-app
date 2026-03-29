import {
  detectPlayActDrift,
  playActDriftSignature,
  type PlayActDriftInput,
} from '../playActDrift';
import {
  getPlayActAccessibilityLabel,
  getPlayActPhaseCaptionText,
} from '../playActPhaseCopy';
import { resolveAgentPlayAct } from '../resolveAgentPlayAct';
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
    activeRequestId: null,
    requestInFlight: false,
    playbackRequestId: null,
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

function goldenInput(partial: Partial<PlayActDriftInput>): PlayActDriftInput {
  const state = partial.state ?? orch({});
  const surface = partial.surface ?? { interactionBandEnabled: true };
  const resolution =
    partial.resolution ?? resolveAgentPlayAct(state, surface);
  const captionEnabled = partial.captionEnabled ?? true;
  const visibleCaption =
    partial.visibleCaption !== undefined
      ? partial.visibleCaption
      : captionEnabled
        ? getPlayActPhaseCaptionText(resolution, state)
        : null;
  const a11yLabel =
    partial.a11yLabel ??
    getPlayActAccessibilityLabel(resolution, state);
  return {
    state,
    resolution,
    surface,
    visibleCaption,
    a11yLabel,
    captionEnabled,
  };
}

describe('detectPlayActDrift golden snapshots', () => {
  it('processing + evaluate: no invariant drift', () => {
    const state = orch({ lifecycle: 'processing' });
    const surface = { interactionBandEnabled: false };
    const resolution = resolveAgentPlayAct(state, surface);
    const input = goldenInput({
      state,
      resolution,
      surface,
      captionEnabled: true,
    });
    expect(
      detectPlayActDrift(input).filter(f => f.severity === 'invariant_violation'),
    ).toHaveLength(0);
  });

  it('error lifecycle: no caption, error-framed a11y', () => {
    const state = orch({ lifecycle: 'error', error: 'Mic failed' });
    const surface = { interactionBandEnabled: true };
    const resolution = resolveAgentPlayAct(state, surface);
    const input = goldenInput({
      state,
      resolution,
      surface,
      visibleCaption: null,
      captionEnabled: true,
    });
    const inv = detectPlayActDrift(input).filter(
      f => f.severity === 'invariant_violation',
    );
    expect(inv).toHaveLength(0);
  });

  it('idle + answer: respond committed with text', () => {
    const state = orch({ lifecycle: 'idle', responseText: 'Hello' });
    const surface = { interactionBandEnabled: true };
    const resolution = resolveAgentPlayAct(state, surface);
    expect(resolution.primaryAct).toBe('respond');
    const input = goldenInput({ state, resolution, surface });
    expect(
      detectPlayActDrift(input).filter(f => f.severity === 'invariant_violation'),
    ).toHaveLength(0);
  });
});

describe('detectPlayActDrift synthetic violations', () => {
  it('error_caption_present when caption shown on error', () => {
    const state = orch({ lifecycle: 'error', error: 'x' });
    const resolution = resolveAgentPlayAct(state, { interactionBandEnabled: true });
    const findings = detectPlayActDrift({
      state,
      resolution,
      surface: { interactionBandEnabled: true },
      visibleCaption: 'Should not show',
      a11yLabel: getPlayActAccessibilityLabel(resolution, state),
      captionEnabled: true,
    });
    expect(findings.some(f => f.code === 'error_caption_present')).toBe(true);
  });

  it('error_a11y_not_error_framed', () => {
    const state = orch({ lifecycle: 'error', error: 'x' });
    const resolution = resolveAgentPlayAct(state, { interactionBandEnabled: true });
    const findings = detectPlayActDrift({
      state,
      resolution,
      surface: { interactionBandEnabled: true },
      visibleCaption: null,
      a11yLabel: 'Agent ready. Awaiting voice input.',
      captionEnabled: true,
    });
    expect(findings.some(f => f.code === 'error_a11y_not_error_framed')).toBe(true);
  });

  it('lifecycle_processing_act_not_evaluate', () => {
    const state = orch({ lifecycle: 'processing' });
    const findings = detectPlayActDrift(
      goldenInput({
        state,
        resolution: res({ primaryAct: 'intake' }),
        surface: { interactionBandEnabled: true },
      }),
    );
    expect(
      findings.some(f => f.code === 'lifecycle_processing_act_not_evaluate'),
    ).toBe(true);
  });

  it('act_evaluate_lifecycle_not_processing', () => {
    const state = orch({ lifecycle: 'idle' });
    const findings = detectPlayActDrift(
      goldenInput({
        state,
        resolution: res({ primaryAct: 'evaluate', commitVisibilityHint: 'provisional' }),
        surface: { interactionBandEnabled: true },
      }),
    );
    expect(
      findings.some(f => f.code === 'act_evaluate_lifecycle_not_processing'),
    ).toBe(true);
  });

  it('respond_committed_no_response_text', () => {
    const state = orch({ lifecycle: 'idle', responseText: null });
    const findings = detectPlayActDrift(
      goldenInput({
        state,
        resolution: res({
          primaryAct: 'respond',
          commitVisibilityHint: 'committed_answer',
        }),
        surface: { interactionBandEnabled: true },
      }),
    );
    expect(
      findings.some(f => f.code === 'respond_committed_no_response_text'),
    ).toBe(true);
  });

  it('processing_phase_label_caption_divergence on wrong caption', () => {
    const state = orch({ lifecycle: 'processing' });
    const resolution = resolveAgentPlayAct(state, { interactionBandEnabled: false });
    const findings = detectPlayActDrift({
      state,
      resolution,
      surface: { interactionBandEnabled: false },
      visibleCaption: 'Answer ready',
      a11yLabel: getPlayActAccessibilityLabel(resolution, state),
      captionEnabled: true,
    });
    expect(
      findings.some(f => f.code === 'processing_phase_label_caption_divergence'),
    ).toBe(true);
  });
});

describe('playActDriftSignature', () => {
  it('returns empty string when no findings', () => {
    expect(playActDriftSignature([])).toBe('');
  });

  it('sorts codes for stability', () => {
    const a = detectPlayActDrift(
      goldenInput({
        state: orch({ lifecycle: 'error' }),
        resolution: res({ primaryAct: 'intake' }),
        visibleCaption: 'bad',
        a11yLabel: 'not error',
        captionEnabled: true,
      }),
    );
    expect(playActDriftSignature(a)).toBe(
      'error_a11y_not_error_framed|error_caption_present',
    );
  });
});
