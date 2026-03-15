/**
 * App UI components barrel. Role-based: content/, panels/, overlays/.
 */

export { ContentPanel } from './panels/ContentPanel';
export type {
  ContentPanelIntensity,
  ContentPanelProps,
  ContentPanelVariant,
} from './panels/ContentPanel';

export { CardReferenceSection } from './content/CardReferenceSection';
export type { CardRef, CardReferenceSectionProps } from './content/CardReferenceSection';

export { SelectedRulesSection } from './content/SelectedRulesSection';
export type {
  SelectedRule,
  SelectedRulesSectionProps,
} from './content/SelectedRulesSection';

export { SemanticChannelLoadingView } from './overlays/SemanticChannelLoadingView';
export type { SemanticChannelLoadingViewProps } from './overlays/SemanticChannelLoadingView';

export { ResultsOverlay } from './overlays/ResultsOverlay';
export type {
  ResultsOverlayProps,
  ResultsOverlayRevealedBlocks,
  ResultsOverlayTheme,
} from './overlays/ResultsOverlay';

export { PipelineTelemetryPanel } from './panels/debug/PipelineTelemetryPanel';
export type { PipelineTelemetryPanelProps } from './panels/debug/PipelineTelemetryPanel';

export { VizDebugPanel } from './panels/debug/VizDebugPanel';
export type { VizDebugPanelProps } from './panels/debug/VizDebugPanel';
