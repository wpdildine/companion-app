/**
 * Derived Play/Act resolution: pure classifier over orchestrator-published state.
 * Copy-related fields (`primaryAct`, `processingSubstate`, `commitVisibilityHint`) are
 * delegated to {@link deriveSemanticChannelCopyCore} in `semanticChannelCanonicalCopy.ts`.
 * See docs/PLAY_ACT_CONTRACT.md and docs/PLAY_ACT_REALIZATION.md.
 *
 * @deprecated for new presentation work — canonical semantic-channel label/caption use
 * `getSemanticChannelAccessibilityLabel` / `getSemanticChannelPhaseCaptionText`; this
 * resolver remains for affordance hints and drift/compat until removed.
 */

import type { AgentOrchestratorState, ProcessingSubstate } from './types';
import { deriveSemanticChannelCopyCore } from './semanticChannelCanonicalCopy';

/** Five documented Acts (stable string ids). */
export type AgentPrimaryAct =
  | 'intake'
  | 'evaluate'
  | 'clarify'
  | 'recover'
  | 'respond';

/** Aligned with PLAY_ACT_CONTRACT.md commitment policy (presentation hints only). */
export type AgentPlayActCommitVisibilityHint =
  | 'uncommitted_or_hidden'
  | 'provisional'
  | 'supplemental_input_expected'
  | 'cleared_or_empty'
  | 'committed_answer';

export type AgentPlayActAffordanceHints = {
  /**
   * Eligibility hint for primary voice intake; must be intersected with surface arbitration.
   * Forced false when lifecycle is `error` or band is disabled.
   */
  voiceIntakeEligible: boolean;
  /** Hint for playback-oriented gestures when an answer may be played. */
  playbackGesturesEligible: boolean;
};

/** Optional surface facts; omitted means no band intersection (orchestrator-only). */
export type PlayActSurfaceFacts = {
  /** When false, voiceIntakeEligible is forced false. */
  interactionBandEnabled?: boolean;
};

export type AgentPlayActResolution = {
  primaryAct: AgentPrimaryAct;
  /** Echo of processing substate only when primaryAct === 'evaluate'; else null. */
  processingSubstate: ProcessingSubstate | null;
  affordanceHints: AgentPlayActAffordanceHints;
  commitVisibilityHint: AgentPlayActCommitVisibilityHint;
};

function hasTrimmedResponse(state: AgentOrchestratorState): boolean {
  const t = state.responseText;
  return typeof t === 'string' && t.trim().length > 0;
}

function affordanceHintsForCore(
  state: AgentOrchestratorState,
  bandOk: boolean,
  core: ReturnType<typeof deriveSemanticChannelCopyCore>,
): AgentPlayActAffordanceHints {
  const hasAnswer = hasTrimmedResponse(state);
  switch (core.primaryAct) {
    case 'evaluate':
      return { voiceIntakeEligible: false, playbackGesturesEligible: false };
    case 'respond':
      if (state.lifecycle === 'speaking') {
        return {
          voiceIntakeEligible: false,
          playbackGesturesEligible: bandOk && hasAnswer,
        };
      }
      return {
        voiceIntakeEligible: false,
        playbackGesturesEligible: bandOk && hasAnswer,
      };
    case 'clarify':
      return { voiceIntakeEligible: bandOk, playbackGesturesEligible: false };
    case 'recover':
      return { voiceIntakeEligible: bandOk, playbackGesturesEligible: false };
    case 'intake':
    default:
      if (state.lifecycle === 'error') {
        return { voiceIntakeEligible: false, playbackGesturesEligible: false };
      }
      return {
        voiceIntakeEligible: bandOk,
        playbackGesturesEligible: bandOk && hasAnswer,
      };
  }
}

/**
 * Pure resolver: one primary Act from current orchestrator snapshot (+ optional band intersection).
 * Does not read transcribedText for classification; does not mutate state.
 */
export function resolveAgentPlayAct(
  state: AgentOrchestratorState,
  surface?: PlayActSurfaceFacts,
): AgentPlayActResolution {
  const bandOk = surface?.interactionBandEnabled !== false;
  const core = deriveSemanticChannelCopyCore(state);
  return {
    primaryAct: core.primaryAct,
    processingSubstate: core.processingSubstate,
    commitVisibilityHint: core.commitVisibilityHint,
    affordanceHints: affordanceHintsForCore(state, bandOk, core),
  };
}
