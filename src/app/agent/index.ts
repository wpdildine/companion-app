/**
 * Agent architecture: AgentOrchestrator, VisualizationController, ResultsOverlay.
 * AgentSurface composes these; see docs/APP_ARCHITECTURE.md.
 */

export type {
  AgentLifecycleState,
  AgentOrchestratorListeners,
  AgentOrchestratorState,
  AgentStateMetadata,
  ProcessingSubstate,
} from './types';
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
