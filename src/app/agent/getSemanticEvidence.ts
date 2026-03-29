/**
 * Pure aggregation of runtime state, surface snapshot, observed events, and outcome projection.
 */

import type { AgentOrchestratorState } from './types';
import { getOutcomeProjection } from './getOutcomeProjection';
import type {
  ObservedEvent,
  SemanticEvidence,
  SemanticPresentationState,
  SemanticSurfaceState,
} from './semanticEvidenceTypes';

export type GetSemanticEvidenceInput = {
  orchestratorState: AgentOrchestratorState;
  surfaceState: SemanticSurfaceState;
  observedEvents: readonly ObservedEvent[];
  presentation?: SemanticPresentationState;
};

function hasTrimmedResponseText(state: AgentOrchestratorState): boolean {
  const t = state.responseText;
  return typeof t === 'string' && t.trim().length > 0;
}

export function getSemanticEvidence(
  input: GetSemanticEvidenceInput,
): SemanticEvidence {
  const { orchestratorState, surfaceState, observedEvents, presentation } =
    input;
  const identity = {
    activeRequestId: orchestratorState.activeRequestId,
    requestInFlight: orchestratorState.requestInFlight,
    playbackRequestId: orchestratorState.playbackRequestId,
  };
  const outcome = getOutcomeProjection({
    lifecycle: orchestratorState.lifecycle,
    error: orchestratorState.error,
    lastFrontDoorOutcome: orchestratorState.lastFrontDoorOutcome ?? null,
    observedEvents,
    hasCommittedResponse: hasTrimmedResponseText(orchestratorState),
  });
  return {
    runtime: orchestratorState,
    identity,
    surface: surfaceState,
    interaction: { observedEvents: [...observedEvents] },
    presentation: presentation ?? {},
    outcome,
  };
}
