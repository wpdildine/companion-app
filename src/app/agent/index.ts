/**
 * Agent architecture: AgentOrchestrator, VisualizationController, ResultsOverlay.
 * AgentSurface composes these; see docs/APP_ARCHITECTURE.md.
 */

export type {
  AgentLifecycleState,
  AgentOrchestratorListeners,
  AgentOrchestratorState,
  AgentStateMetadata,
} from './types';
export { useAgentOrchestrator } from './useAgentOrchestrator';
export type { AgentOrchestratorActions, UseAgentOrchestratorOptions } from './useAgentOrchestrator';
export { useVisualizationController } from './useVisualizationController';
export type { UseVisualizationControllerOptions } from './useVisualizationController';
export { ResultsOverlay } from './ResultsOverlay';
export type {
  ResultsOverlayProps,
  ResultsOverlayRevealedBlocks,
  ResultsOverlayTheme,
} from './ResultsOverlay';
