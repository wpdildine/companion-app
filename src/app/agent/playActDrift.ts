/**
 * Cycle 9 — read-only Play/Act drift detection (docs/PLAY_ACT_MEASUREMENT.md).
 * Compares orchestrator truth, resolver output, and rendered caption/a11y strings.
 * Does not mutate state or influence control flow; consumers log or test only.
 */

import type { AgentOrchestratorState } from './types';
import type { AgentPlayActResolution } from './resolveAgentPlayAct';

export type PlayActDriftSeverity = 'invariant_violation' | 'informational';

/** Stable codes for tests, logs, and classification (mapper vs resolver vs ambiguity). */
export type PlayActDriftCode =
  | 'error_caption_present'
  | 'error_a11y_not_error_framed'
  | 'lifecycle_processing_act_not_evaluate'
  | 'act_evaluate_lifecycle_not_processing'
  | 'respond_committed_no_response_text'
  | 'cleared_hint_with_response_text_suspect'
  | 'intake_band_voice_copy_ambiguity'
  | 'processing_phase_label_caption_divergence';

export type PlayActDriftFinding = {
  code: PlayActDriftCode;
  severity: PlayActDriftSeverity;
  /** Hint for classification: consumer / resolver / orchestrator / ambiguity */
  suggestedClass: 'mapper' | 'resolver' | 'orchestrator' | 'ux_ambiguity';
};

export type PlayActDriftInput = {
  state: AgentOrchestratorState;
  resolution: AgentPlayActResolution;
  /** Same facts passed into resolveAgentPlayAct (read-only). */
  surface: { interactionBandEnabled: boolean };
  /** Caption passed to semantic channel (null when Stage 2 off or empty). */
  visibleCaption: string | null;
  a11yLabel: string;
  /** Whether visible caption feature is enabled (PLAY_ACT_PHASE_CAPTION_ENABLED). */
  captionEnabled: boolean;
};

function hasTrimmedResponseText(state: AgentOrchestratorState): boolean {
  return Boolean(state.responseText?.trim());
}

function isErrorFramedAccessibilityLabel(label: string): boolean {
  const t = label.trim();
  return t.startsWith('Error.') || /^Error\s/i.test(t);
}

function copyImpliesVoiceIntake(caption: string | null, a11y: string): boolean {
  const c = (caption ?? '').toLowerCase();
  const a = a11y.toLowerCase();
  if (c.includes('ready to listen')) return true;
  if (a.includes('awaiting voice') || a.includes('voice input')) return true;
  return false;
}

/**
 * Returns drift findings for one frame. Empty array means no detected drift.
 * Pure function — safe for unit tests and dev-only logging.
 */
export function detectPlayActDrift(input: PlayActDriftInput): PlayActDriftFinding[] {
  const { state, resolution, visibleCaption, a11yLabel, captionEnabled } = input;
  void input.surface;

  const findings: PlayActDriftFinding[] = [];

  if (state.lifecycle === 'error') {
    if (visibleCaption != null && String(visibleCaption).length > 0) {
      findings.push({
        code: 'error_caption_present',
        severity: 'invariant_violation',
        suggestedClass: 'mapper',
      });
    }
    if (!isErrorFramedAccessibilityLabel(a11yLabel)) {
      findings.push({
        code: 'error_a11y_not_error_framed',
        severity: 'invariant_violation',
        suggestedClass: 'mapper',
      });
    }
  }

  if (state.lifecycle === 'processing' && resolution.primaryAct !== 'evaluate') {
    findings.push({
      code: 'lifecycle_processing_act_not_evaluate',
      severity: 'invariant_violation',
      suggestedClass: 'resolver',
    });
  }

  if (resolution.primaryAct === 'evaluate' && state.lifecycle !== 'processing') {
    findings.push({
      code: 'act_evaluate_lifecycle_not_processing',
      severity: 'invariant_violation',
      suggestedClass: 'resolver',
    });
  }

  if (
    resolution.primaryAct === 'respond' &&
    resolution.commitVisibilityHint === 'committed_answer' &&
    !hasTrimmedResponseText(state)
  ) {
    findings.push({
      code: 'respond_committed_no_response_text',
      severity: 'invariant_violation',
      suggestedClass: 'resolver',
    });
  }

  if (
    resolution.commitVisibilityHint === 'cleared_or_empty' &&
    hasTrimmedResponseText(state) &&
    state.lifecycle !== 'speaking' &&
    state.lifecycle !== 'processing' &&
    resolution.primaryAct !== 'recover'
  ) {
    findings.push({
      code: 'cleared_hint_with_response_text_suspect',
      severity: 'informational',
      suggestedClass: 'orchestrator',
    });
  }

  if (
    resolution.primaryAct === 'intake' &&
    resolution.affordanceHints.voiceIntakeEligible === false &&
    copyImpliesVoiceIntake(visibleCaption, a11yLabel)
  ) {
    findings.push({
      code: 'intake_band_voice_copy_ambiguity',
      severity: 'informational',
      suggestedClass: 'ux_ambiguity',
    });
  }

  if (state.lifecycle === 'processing') {
    if (a11yLabel && !a11yLabel.includes('Processing')) {
      findings.push({
        code: 'processing_phase_label_caption_divergence',
        severity: 'invariant_violation',
        suggestedClass: 'mapper',
      });
    }
    if (
      captionEnabled &&
      visibleCaption != null &&
      visibleCaption.length > 0 &&
      visibleCaption !== 'Working on it…'
    ) {
      findings.push({
        code: 'processing_phase_label_caption_divergence',
        severity: 'invariant_violation',
        suggestedClass: 'mapper',
      });
    }
  }

  return findings;
}

/** Stable signature for deduping dev logs across identical finding sets. */
export function playActDriftSignature(findings: PlayActDriftFinding[]): string {
  if (findings.length === 0) return '';
  return findings
    .map(f => f.code)
    .sort()
    .join('|');
}
