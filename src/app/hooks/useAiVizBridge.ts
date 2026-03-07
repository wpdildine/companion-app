/**
 * DEPRECATED: legacy visualization bridge naming.
 * Use VisualizationController / VisualizationSignals instead.
 * Scheduled for removal after Phase 6 architecture stabilization.
 * TODO: Remove legacy visualization bridge naming
 * TODO: Replace AiVizBridge identifiers with VisualizationController equivalents
 * TODO: Replace VizBridge shorthand with canonical VisualizationController naming
 * TODO: Remove temporary compatibility exports for legacy bridge identifiers
 * TODO: Audit repo for remaining shorthand visualization naming
 * TODO: Ensure only VisualizationController / VisualizationSignals vocabulary remains
 */

import type { RefObject } from 'react';
import type { VisualizationEngineRef } from '../../visualization';
import { useVisualizationSignals } from './useVisualizationSignals';

/** @deprecated Use useVisualizationSignals. */
export function useAiVizBridge(
  visualizationRef: RefObject<VisualizationEngineRef | null>,
) {
  return useVisualizationSignals(visualizationRef);
}
