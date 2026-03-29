/**
 * Bump when approved product copy deltas ship (see docs/semanticChannelCopyParity.matrix.md).
 */
export const SEMANTIC_CHANNEL_COPY_REVISION = 1;

/**
 * Canonical semantic-channel accessibility label and visible phase caption.
 * Single policy: derived from orchestrator snapshot (via SemanticEvidence.runtime)
 * with optional __DEV__ coherence checks against ActDescriptor.
 *
 * Legacy `resolveAgentPlayAct` / `playActPhaseCopy` delegate here for copy;
 * affordance hints remain on `resolveAgentPlayAct` only.
 *
 * See docs/semanticChannelCopyParity.matrix.md and docs/PLAY_ACT_BOUNDARIES.md.
 */

import type { FrontDoorVerdict } from '@atlas/runtime';
import type { ActDescriptor, ActSituationFamily } from './actDescriptorTypes';
import type { SemanticEvidence } from './semanticEvidenceTypes';
import type { AgentOrchestratorState, ProcessingSubstate } from './types';
import type {
  AgentPlayActCommitVisibilityHint,
  AgentPrimaryAct,
} from './resolveAgentPlayAct';

/** Copy-relevant slice; matches resolver outputs used by string mappers (no affordances). */
export type SemanticChannelCopyCore = {
  primaryAct: AgentPrimaryAct;
  processingSubstate: ProcessingSubstate | null;
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
 * Pure phase table for label/caption — identical policy to historical
 * `resolveAgentPlayAct` primaryAct / processingSubstate / commitVisibilityHint.
 * Does not use interactionBandEnabled (affordances only).
 */
export function deriveSemanticChannelCopyCore(
  state: AgentOrchestratorState,
): SemanticChannelCopyCore {
  const { lifecycle } = state;

  if (lifecycle === 'processing') {
    return {
      primaryAct: 'evaluate',
      processingSubstate: state.processingSubstate,
      commitVisibilityHint: 'provisional',
    };
  }

  if (lifecycle === 'speaking') {
    return {
      primaryAct: 'respond',
      processingSubstate: null,
      commitVisibilityHint: 'committed_answer',
    };
  }

  if (lifecycle === 'error') {
    return {
      primaryAct: 'intake',
      processingSubstate: null,
      commitVisibilityHint: 'cleared_or_empty',
    };
  }

  const v = frontDoorVerdict(state);
  const listenOrIdle = lifecycle === 'listening' || lifecycle === 'idle';

  if (listenOrIdle && v === 'clarify_entity') {
    return {
      primaryAct: 'clarify',
      processingSubstate: null,
      commitVisibilityHint: 'supplemental_input_expected',
    };
  }

  if (listenOrIdle && isAbstainVerdict(v)) {
    return {
      primaryAct: 'recover',
      processingSubstate: null,
      commitVisibilityHint: 'cleared_or_empty',
    };
  }

  if (lifecycle === 'idle' && hasTrimmedResponse(state)) {
    return {
      primaryAct: 'respond',
      processingSubstate: null,
      commitVisibilityHint: 'committed_answer',
    };
  }

  const hasAnswerVisible = hasTrimmedResponse(state);
  return {
    primaryAct: 'intake',
    processingSubstate: null,
    commitVisibilityHint: hasAnswerVisible
      ? 'committed_answer'
      : 'uncommitted_or_hidden',
  };
}

/** Screen reader label for the semantic channel (orchestrator error wins). */
export function mapSemanticChannelAccessibilityLabel(
  core: SemanticChannelCopyCore,
  state: AgentOrchestratorState,
): string {
  if (state.lifecycle === 'error') {
    const msg = state.error?.trim();
    return msg ? `Error. ${msg}` : 'Error. Voice or system issue.';
  }

  switch (core.primaryAct) {
    case 'intake':
      return 'Agent ready. Awaiting voice input.';
    case 'evaluate':
      return 'Processing your question.';
    case 'clarify':
      return 'Clarification needed. Refine your question.';
    case 'recover':
      return 'Could not complete. You can try again.';
    case 'respond':
      if (state.lifecycle === 'speaking') {
        return 'Playing answer.';
      }
      return 'Answer displayed.';
    default:
      return 'Agent';
  }
}

/**
 * Visible phase caption; null when error lifecycle.
 * Respond branch uses commitVisibilityHint (including resolver-unreachable combos for parity lock).
 */
export function mapSemanticChannelPhaseCaptionText(
  core: SemanticChannelCopyCore,
  state: AgentOrchestratorState,
): string | null {
  if (state.lifecycle === 'error') {
    return null;
  }

  switch (core.primaryAct) {
    case 'intake':
      return 'Ready to listen';
    case 'evaluate':
      return 'Working on it…';
    case 'clarify':
      return 'Needs a clearer question';
    case 'recover':
      return 'Try again when ready';
    case 'respond':
      if (state.lifecycle === 'speaking') {
        return 'Playing answer';
      }
      switch (core.commitVisibilityHint) {
        case 'provisional':
          return 'Forming answer…';
        case 'cleared_or_empty':
          return 'No answer displayed';
        case 'supplemental_input_expected':
          return 'More detail needed';
        case 'uncommitted_or_hidden':
        case 'committed_answer':
        default:
          return 'Answer ready';
      }
    default:
      return null;
  }
}

/**
 * Mirrors `resolveActDescriptor` situation-family ordering for __DEV__ checks only.
 */
function expectedActSituationFamily(evidence: SemanticEvidence): ActSituationFamily {
  const { runtime, outcome } = evidence;

  if (outcome?.class === 'terminal') return 'SystemFault';
  if (outcome?.class === 'blocked') return 'ClarificationPending';
  if (outcome?.class === 'recoverable') return 'RecoverableSetback';
  if (outcome?.class === 'success') return 'AnswerActive';

  if (runtime.lifecycle === 'processing' || runtime.lifecycle === 'listening') {
    return 'WorkInFlight';
  }
  if (runtime.lifecycle === 'speaking') return 'WorkInFlight';
  if (runtime.lifecycle === 'error') return 'SystemFault';

  return 'InputOpen';
}

/**
 * Canonical accessibility label from evidence + Act (Act used for __DEV__ coherence only).
 */
export function getSemanticChannelAccessibilityLabel(
  evidence: SemanticEvidence,
  act: ActDescriptor,
): string {
  const core = deriveSemanticChannelCopyCore(evidence.runtime);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const expected = expectedActSituationFamily(evidence);
    if (
      act.identity.family !== expected &&
      evidence.runtime.lifecycle !== 'error'
    ) {
      console.warn(
        '[SemanticChannelCopy] ActDescriptor.family diverges from outcome/runtime projection (observational)',
        {
          family: act.identity.family,
          expected,
          primaryAct: core.primaryAct,
        },
      );
    }
  }
  return mapSemanticChannelAccessibilityLabel(core, evidence.runtime);
}

/**
 * Canonical phase caption; callers gate on product flag (e.g. PLAY_ACT_PHASE_CAPTION_ENABLED).
 */
export function getSemanticChannelPhaseCaptionText(
  evidence: SemanticEvidence,
  act: ActDescriptor,
): string | null {
  const core = deriveSemanticChannelCopyCore(evidence.runtime);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const expected = expectedActSituationFamily(evidence);
    if (
      act.identity.family !== expected &&
      evidence.runtime.lifecycle !== 'error'
    ) {
      console.warn(
        '[SemanticChannelCopy] ActDescriptor.family diverges from outcome/runtime projection (observational)',
        {
          family: act.identity.family,
          expected,
          primaryAct: core.primaryAct,
        },
      );
    }
  }
  return mapSemanticChannelPhaseCaptionText(core, evidence.runtime);
}
