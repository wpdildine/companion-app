/**
 * Layer runtime inputs: derived read surface from the existing ref.
 * Shared read surface, not a command bus; no stored duplicate on the ref.
 * Scene-authored data (organism, motion, transientEffects) stays on scene.
 */

import type { RefObject } from 'react';
import type { VisualizationEngineRef } from './types';

/** Projected ref-owned runtime channels only. All optional when ref is missing. */
export interface LayerRuntimeInputs {
  activity?: number;
  mode?: VisualizationEngineRef['currentMode'];
  clock?: number;
  lastEvent?: VisualizationEngineRef['lastEvent'];
  lastEventTime?: number;
  rulesClusterCount?: number;
  cardsClusterCount?: number;
  layerCount?: number;
  deconWeight?: number;
  planeOpacity?: number;
  driftPx?: number;
  hueShift?: number;
  pulsePositions?: VisualizationEngineRef['pulsePositions'];
  pulseTimes?: VisualizationEngineRef['pulseTimes'];
  pulseColors?: VisualizationEngineRef['pulseColors'];
  lastPulseIndex?: number;
}

/** Derives a read surface from the canonical ref at read time. No stored copy on the ref. */
export function getLayerRuntimeInputs(
  ref: RefObject<VisualizationEngineRef | null> | VisualizationEngineRef | null,
): LayerRuntimeInputs {
  const v = ref && typeof ref === 'object' && 'current' in ref ? ref.current : ref;
  if (!v) return {};
  return {
    activity: v.activity,
    mode: v.currentMode,
    clock: v.clock,
    lastEvent: v.lastEvent,
    lastEventTime: v.lastEventTime,
    rulesClusterCount: v.rulesClusterCount,
    cardsClusterCount: v.cardsClusterCount,
    layerCount: v.layerCount,
    deconWeight: v.deconWeight,
    planeOpacity: v.planeOpacity,
    driftPx: v.driftPx,
    hueShift: v.hueShift,
    pulsePositions: v.pulsePositions,
    pulseTimes: v.pulseTimes,
    pulseColors: v.pulseColors,
    lastPulseIndex: v.lastPulseIndex,
  };
}
