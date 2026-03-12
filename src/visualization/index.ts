/**
 * Visualization public surface. Single entry for app/ui.
 */

export { getSceneDescription, type GLSceneDescription, type GetSceneDescriptionOptions } from './scene/sceneFormations';
export { validateSceneSpec } from './scene/validateSceneSpec';

export { createDefaultVisualizationRef, TARGET_ACTIVITY_BY_MODE } from './runtime/createDefaultRef';
export { applyVisualizationSignals } from './runtime/applyVisualizationSignals';
export {
  setVisualizationScene,
  subscribeVisualizationScene,
  updateVisualizationLayerDescriptors,
} from './runtime/applySceneUpdates';
export { triggerPulseAtCenter } from './runtime/triggerPulse';
export { validateVizState, type ValidationResult, type ValidateVizStateOptions } from './runtime/validateVizState';
export { withTouchStubs, type TouchCallbacks } from './interaction/touchHandlers';

export type {
  VisualizationEngineRef,
  VisualizationMode,
  TouchNdc,
  VisualizationIntensity,
  VisualizationPanelRects,
} from './runtime/runtimeTypes';
export type {
  VisualizationSignals,
  VisualizationSignalEvent,
} from './runtime/visualizationSignals';

export {
  TRANSIENT_SIGNAL_FIRST_TOKEN,
  TRANSIENT_SIGNAL_SOFT_FAIL,
  TRANSIENT_SIGNAL_TERMINAL_FAIL,
  VALID_TRANSIENT_SIGNALS,
  isTransientVisualSignal,
  type TransientVisualSignal,
} from './runtime/visualizationSignals';

export { VisualizationCanvas } from './render/canvas/VisualizationCanvas';
export { VisualizationSurface } from './render/canvas/VisualizationSurface';
export { VisualizationCanvasR3F, type VisualizationCanvasR3FProps } from './render/canvas/VisualizationCanvasR3F';
export {
  DebugZoneOverlay,
  type DebugZoneOverlayProps,
} from './render/dev/DebugZoneOverlay';
export { InteractionBand, type InteractionBandProps } from './interaction/InteractionBand';
export { DevPanel, type DevPanelTheme } from './render/dev/DevPanel';
