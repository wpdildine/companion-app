/**
 * Visualization public surface. Single entry for app/ui.
 */

export { getSceneDescription, type GLSceneDescription, type GetSceneDescriptionOptions } from './scene/formations';
export { validateSceneDescription } from './scene/validateSceneDescription';

export { createDefaultVisualizationRef, TARGET_ACTIVITY_BY_MODE } from './engine/createDefaultRef';
export { applySignalsToVisualization } from './engine/applySignalsToVisualization';
export { triggerPulseAtCenter } from './engine/triggerPulse';
export { validateVizState, type ValidationResult, type ValidateVizStateOptions } from './engine/validateVizState';
export { withTouchStubs, type TouchCallbacks } from './interaction/touchHandlers';

export type {
  VisualizationEngineRef,
  VisualizationMode,
  TouchNdc,
  AiUiSignals,
  AiUiSignalsEvent,
  VisualizationIntensity,
  VisualizationPanelRects,
} from './engine/types';

export {
  TRANSIENT_SIGNAL_FIRST_TOKEN,
  TRANSIENT_SIGNAL_SOFT_FAIL,
  VALID_TRANSIENT_SIGNALS,
  isTransientVisualSignal,
  type TransientVisualSignal,
} from './engine/signals';

export { VisualizationCanvas } from './render/canvas/VisualizationCanvas';
export { VisualizationSurface } from './render/canvas/VisualizationSurface';
export { VisualizationCanvasR3F, type VisualizationCanvasR3FProps } from './render/canvas/VisualizationCanvasR3F';
export {
  DebugZoneOverlay,
  type DebugZoneOverlayProps,
} from './render/dev/DebugZoneOverlay';
export { InteractionBand, type InteractionBandProps } from './interaction/InteractionBand';
export { DevPanel, type DevPanelTheme } from './render/dev/DevPanel';
