/**
 * Derived Play/Act resolution: pure classifier over orchestrator-published state.
 * See docs/PLAY_ACT_CONTRACT.md and docs/PLAY_ACT_REALIZATION.md.
 */

import type { FrontDoorVerdict } from '@atlas/runtime';
import type { AgentOrchestratorState, ProcessingSubstate } from './types';

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

function frontDoorVerdict(
  state: AgentOrchestratorState,
): FrontDoorVerdict | null {
  return state.lastFrontDoorOutcome?.semanticFrontDoor.front_door_verdict ?? null;
}

function isAbstainVerdict(v: FrontDoorVerdict | null): boolean {
  return v === 'abstain_no_grounding' || v === 'abstain_transcript';
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
  const { lifecycle } = state;

  if (lifecycle === 'processing') {
    return {
      primaryAct: 'evaluate',
      processingSubstate: state.processingSubstate,
      affordanceHints: {
        voiceIntakeEligible: false,
        playbackGesturesEligible: false,
      },
      commitVisibilityHint: 'provisional',
    };
  }

  if (lifecycle === 'speaking') {
    return {
      primaryAct: 'respond',
      processingSubstate: null,
      affordanceHints: {
        voiceIntakeEligible: false,
        playbackGesturesEligible: bandOk && hasTrimmedResponse(state),
      },
      commitVisibilityHint: 'committed_answer',
    };
  }

  if (lifecycle === 'error') {
    return {
      primaryAct: 'intake',
      processingSubstate: null,
      affordanceHints: {
        voiceIntakeEligible: false,
        playbackGesturesEligible: false,
      },
      commitVisibilityHint: 'cleared_or_empty',
    };
  }

  const v = frontDoorVerdict(state);
  const listenOrIdle = lifecycle === 'listening' || lifecycle === 'idle';

  if (listenOrIdle && v === 'clarify_entity') {
    return {
      primaryAct: 'clarify',
      processingSubstate: null,
      affordanceHints: {
        voiceIntakeEligible: bandOk,
        playbackGesturesEligible: false,
      },
      commitVisibilityHint: 'supplemental_input_expected',
    };
  }

  /** Abstain beats idle+responseText so retry/recover framing wins over stale answer chrome. */
  if (listenOrIdle && isAbstainVerdict(v)) {
    return {
      primaryAct: 'recover',
      processingSubstate: null,
      affordanceHints: {
        voiceIntakeEligible: bandOk,
        playbackGesturesEligible: false,
      },
      commitVisibilityHint: 'cleared_or_empty',
    };
  }

  if (lifecycle === 'idle' && hasTrimmedResponse(state)) {
    return {
      primaryAct: 'respond',
      processingSubstate: null,
      affordanceHints: {
        voiceIntakeEligible: false,
        playbackGesturesEligible: bandOk,
      },
      commitVisibilityHint: 'committed_answer',
    };
  }

  const hasAnswerVisible = hasTrimmedResponse(state);
  return {
    primaryAct: 'intake',
    processingSubstate: null,
    affordanceHints: {
      voiceIntakeEligible: bandOk,
      playbackGesturesEligible: bandOk && hasAnswerVisible,
    },
    commitVisibilityHint: hasAnswerVisible
      ? 'committed_answer'
      : 'uncommitted_or_hidden',
  };
}
