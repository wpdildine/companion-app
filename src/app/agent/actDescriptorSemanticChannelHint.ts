/**
 * Act descriptor → semantic channel accessibility hint (second adoption).
 * Supplementary to Play/Act label; orchestrator error lifecycle suppresses hint.
 * See docs/ACT_DESCRIPTOR_SPEC.md.
 */

import type { ActDescriptor } from './actDescriptorTypes';
import type { AgentOrchestratorState } from './types';

/**
 * Neutral situation gloss for screen readers. No imperatives; no pathways/affordances.
 * Returns null when lifecycle is error so the Play/Act label owns error truth.
 */
export function getActDescriptorSemanticChannelHint(
  act: ActDescriptor,
  state: AgentOrchestratorState,
): string | null {
  if (state.lifecycle === 'error') {
    return null;
  }

  switch (act.identity.family) {
    case 'InputOpen':
      return 'The agent is idle and ready for a new spoken question when voice input is available.';
    case 'WorkInFlight': {
      const bucket = act.semanticSituation.inFlightBucket;
      if (bucket === 'open_mic') {
        return 'Voice capture or listening is active.';
      }
      if (bucket === 'awaiting_async') {
        return 'A response is being prepared.';
      }
      return 'Audio or background processing is in progress.';
    }
    case 'ClarificationPending':
      return 'The current question may need more specificity before a full answer.';
    case 'RecoverableSetback':
      return 'The last request did not complete successfully.';
    case 'AnswerActive':
      return 'A grounded answer is available in this scrollable area.';
    case 'SystemFault':
      return 'A system or voice issue affects this session.';
    default:
      return null;
  }
}
