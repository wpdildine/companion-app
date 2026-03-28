/**
 * Cycle 6 — presentation-only copy derived from Play/Act resolution + orchestrator truth.
 * Hard error UX must follow lifecycle === 'error', not primaryAct (PLAY_ACT_REALIZATION.md).
 */

import type { AgentOrchestratorState } from './types';
import type { AgentPlayActResolution } from './resolveAgentPlayAct';

/** Screen reader / accessibility label for the semantic channel container. */
export function getPlayActAccessibilityLabel(
  resolution: AgentPlayActResolution,
  state: AgentOrchestratorState,
): string {
  if (state.lifecycle === 'error') {
    const msg = state.error?.trim();
    return msg ? `Error. ${msg}` : 'Error. Voice or system issue.';
  }

  switch (resolution.primaryAct) {
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
 * Optional visible phase caption (Cycle 6 Stage 2). Subordinate to orchestrator/error truth.
 * Returns null when error lifecycle (surface should show error UI, not duplicate banner).
 */
export function getPlayActPhaseCaptionText(
  resolution: AgentPlayActResolution,
  state: AgentOrchestratorState,
): string | null {
  if (state.lifecycle === 'error') {
    return null;
  }

  switch (resolution.primaryAct) {
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
      return 'Answer ready';
    default:
      return null;
  }
}
