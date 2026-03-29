/**
 * Pure aggregation of runtime state, surface snapshot, observed events, and outcome projection.
 */

import type { ActDescriptor } from './actDescriptorTypes';
import { getOutcomeProjection } from './getOutcomeProjection';
import type {
  ObservedEvent,
  SemanticEvidence,
  SemanticPresentationState,
  SemanticSurfaceState,
} from './semanticEvidenceTypes';
import type { AgentOrchestratorState } from './types';
import { resolveActDescriptor } from './resolveActDescriptor';

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

/**
 * __DEV__ / tooling: same snapshot as {@link getSemanticEvidence} plus Act descriptor.
 * Observational only — do not branch app behavior on this bundle (see docs/ACT_DESCRIPTOR_SPEC.md).
 */
export type AtlasSemanticChannelDebugSnapshot = {
  semanticEvidence: SemanticEvidence;
  actDescriptor: ActDescriptor;
};

export function buildAtlasSemanticChannelDebugSnapshot(
  input: GetSemanticEvidenceInput,
): AtlasSemanticChannelDebugSnapshot {
  const semanticEvidence = getSemanticEvidence(input);
  return {
    semanticEvidence,
    actDescriptor: resolveActDescriptor(semanticEvidence),
  };
}
