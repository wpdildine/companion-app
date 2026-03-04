/**
 * Visualization public surface. Single entry for app/ui.
 */

export { getSceneDescription, type GLSceneDescription, type GetSceneDescriptionOptions } from './scene/formations';
export { validateSceneDescription } from './scene/validateSceneDescription';

export { createDefaultNodeMapRef, TARGET_ACTIVITY_BY_MODE } from './engine/createDefaultRef';
export { applySignalsToNodeMap } from './engine/applySignalsToNodeMap';
export { triggerPulseAtCenter } from './engine/triggerPulse';
export { validateVizState, type ValidationResult, type ValidateVizStateOptions } from './engine/validateVizState';
export { withTouchStubs, type TouchCallbacks } from './interaction/touchHandlers';

export type {
  NodeMapEngineRef,
  NodeMapMode,
  TouchNdc,
  AiUiSignals,
  AiUiSignalsEvent,
  NodeMapIntensity,
  NodeMapPanelRects,
} from './engine/types';

export { NodeMapCanvas } from './render/canvas/NodeMapCanvas';
export { NodeMapSurface } from './render/canvas/NodeMapSurface';
export { VisualizationCanvasR3F, type VisualizationCanvasR3FProps } from './render/canvas/VisualizationCanvasR3F';
export { InteractionBand, type InteractionBandProps } from './interaction/InteractionBand';
export { DevPanel, type DevPanelTheme } from './render/dev/DevPanel';
