/**
 * Presentation-only copy from Play/Act resolution + orchestrator truth (Cycles 6–8).
 * Hard error UX must follow lifecycle === 'error', not primaryAct (PLAY_ACT_REALIZATION.md).
 *
 * **Shim:** string policy lives in `semanticChannelCanonicalCopy.ts`; these entry points
 * preserve the legacy `(resolution, state)` signature for tests and drift tooling.
 */

import type { AgentOrchestratorState } from './types';
import type { AgentPlayActResolution } from './resolveAgentPlayAct';
import {
  mapSemanticChannelAccessibilityLabel,
  mapSemanticChannelPhaseCaptionText,
} from './semanticChannelCanonicalCopy';

/**
 * Screen reader / accessibility label for the semantic channel container.
 * @deprecated Prefer `getSemanticChannelAccessibilityLabel` from `semanticChannelCanonicalCopy`
 * (via `getSemanticEvidence` + `resolveActDescriptor`); kept for drift/tests and the legacy signature.
 */
export function getPlayActAccessibilityLabel(
  resolution: AgentPlayActResolution,
  state: AgentOrchestratorState,
): string {
  return mapSemanticChannelAccessibilityLabel(resolution, state);
}

/**
 * Visible phase caption (Cycle 8 Stage 2). Subordinate to orchestrator/error truth.
 * Uses primaryAct + commitVisibilityHint for Respond variants; returns null when error lifecycle.
 * @deprecated Prefer `getSemanticChannelPhaseCaptionText` from `semanticChannelCanonicalCopy`.
 */
export function getPlayActPhaseCaptionText(
  resolution: AgentPlayActResolution,
  state: AgentOrchestratorState,
): string | null {
  return mapSemanticChannelPhaseCaptionText(resolution, state);
}
