/**
 * Agent architecture: AgentOrchestrator, VisualizationController, ResultsOverlay.
 * AgentSurface composes these; see docs/APP_ARCHITECTURE.md.
 */

export type {
  AgentLifecycleState,
  AgentOrchestratorListeners,
  AgentOrchestratorState,
  AgentStateMetadata,
  LastFrontDoorOutcome,
  ProcessingSubstate,
} from './types';
export {
  resolveAgentPlayAct,
} from './resolveAgentPlayAct';
export type {
  AgentPlayActAffordanceHints,
  AgentPlayActCommitVisibilityHint,
  AgentPlayActResolution,
  AgentPrimaryAct,
  PlayActSurfaceFacts,
} from './resolveAgentPlayAct';
export {
  getPlayActAccessibilityLabel,
  getPlayActPhaseCaptionText,
} from './playActPhaseCopy';
export {
  detectPlayActDrift,
  playActDriftSignature,
} from './playActDrift';
export type {
  PlayActDriftCode,
  PlayActDriftFinding,
  PlayActDriftInput,
  PlayActDriftSeverity,
} from './playActDrift';
export { useAgentOrchestrator } from './useAgentOrchestrator';
export type {
  AgentOrchestratorActions,
  RequestDebugSink,
  UseAgentOrchestratorOptions,
} from './useAgentOrchestrator';
export { useVisualizationController } from './useVisualizationController';
export type { UseVisualizationControllerOptions } from './useVisualizationController';
export { emit, getState, subscribe } from './requestDebugStore';
export { REQUEST_DEBUG_RECENT_MAX } from './requestDebugTypes';
export type {
  RequestDebugEvent,
  RequestDebugSnapshot,
  RequestDebugState,
  RequestDebugEmitPayload,
  RequestDebugStatus,
} from './requestDebugTypes';
export type {
  ObservedEvent,
  ObservedEventKind,
  ObservedEventSource,
  OutcomeProjection,
  OutcomeProjectionClass,
  OutcomeProjectionSource,
  SemanticEvidence,
  SemanticPresentationState,
  SemanticSurfaceState,
} from './semanticEvidenceTypes';
export { appendSemanticEvidenceEvent } from './semanticEvidenceSink';
export type { SemanticEvidenceEventsRef } from './semanticEvidenceSink';
export { mirrorRequestIdentityFromRefs } from './semanticEvidenceMirror';
export { getOutcomeProjection } from './getOutcomeProjection';
export type { GetOutcomeProjectionInput } from './getOutcomeProjection';
export {
  buildAtlasSemanticChannelDebugSnapshot,
  getSemanticEvidence,
} from './getSemanticEvidence';
export type {
  AtlasSemanticChannelDebugSnapshot,
  GetSemanticEvidenceInput,
} from './getSemanticEvidence';
export {
  resolveActDescriptor,
  validateActDescriptorCoherence,
} from './resolveActDescriptor';
export type { ActDescriptorValidationIssue } from './resolveActDescriptor';
export type {
  ActAffordanceTag,
  ActContinuationMode,
  ActDescriptor,
  ActPathwayDescriptor,
  ActPathwayTag,
  ActSituationFamily,
  GestureChannelId,
  GestureInterpretiveRole,
} from './actDescriptorTypes';
export {
  ACT_DESCRIPTOR_SCHEMA_VERSION,
  ACT_PATHWAY_TAGS_ALL,
} from './actDescriptorTypes';
export { getActDescriptorSemanticChannelHint } from './actDescriptorSemanticChannelHint';
