/**
 * Validate VizEngineRef shape and ranges. Pure; no React/theme.
 * Use in __DEV__ or tests.
 * Cluster counts (rulesClusterCount, cardsClusterCount) are validated against options.maxPerCluster (default 8).
 * Usage: when validating state and scene is available, pass { maxPerCluster: scene.maxPerCluster } so validation matches the scene contract.
 */

import type { NodeMapMode, NodeMapIntensity } from '../nodeMap/types';

const DEFAULT_MAX_PER_CLUSTER = 8;

const NODE_MAP_MODES: NodeMapMode[] = [
  'idle',
  'listening',
  'processing',
  'speaking',
  'touched',
  'released',
];

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

function inRange(x: number, min: number, max: number): boolean {
  return typeof x === 'number' && !Number.isNaN(x) && x >= min && x <= max;
}

export type ValidateVizStateOptions = {
  /** Max count per cluster (rules/cards). Default 8. Pass scene.maxPerCluster to align with scene. */
  maxPerCluster?: number;
};

export function validateVizState(
  state: unknown,
  options?: ValidateVizStateOptions,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maxPerCluster = options?.maxPerCluster ?? DEFAULT_MAX_PER_CLUSTER;

  if (!state || typeof state !== 'object') {
    return { valid: false, errors: ['state must be an object'], warnings: [] };
  }

  const s = state as Record<string, unknown>;

  if (typeof s.clock !== 'number' || Number.isNaN(s.clock)) {
    errors.push('clock must be a number');
  }
  if (!inRange(s.activity as number, 0, 1)) {
    errors.push('activity must be in [0,1]');
  }
  if (!inRange(s.targetActivity as number, 0, 1)) {
    errors.push('targetActivity must be in [0,1]');
  }
  if (!Array.isArray(s.pulsePositions) || s.pulsePositions.length !== 3) {
    errors.push('pulsePositions must be array of length 3');
  }
  if (!Array.isArray(s.pulseTimes) || s.pulseTimes.length !== 3) {
    errors.push('pulseTimes must be array of length 3');
  }
  if (!Array.isArray(s.pulseColors) || s.pulseColors.length !== 3) {
    errors.push('pulseColors must be array of length 3');
  }
  if (
    typeof s.lastPulseIndex !== 'number' ||
    s.lastPulseIndex < 0 ||
    s.lastPulseIndex > 2
  ) {
    errors.push('lastPulseIndex must be 0, 1, or 2');
  }
  if (!NODE_MAP_MODES.includes(s.currentMode as NodeMapMode)) {
    errors.push(`currentMode must be one of ${NODE_MAP_MODES.join(', ')}`);
  }
  if (s.touchWorld !== null && !Array.isArray(s.touchWorld)) {
    errors.push('touchWorld must be null or [number, number, number]');
  }
  if (s.pendingTapNdc !== null && !Array.isArray(s.pendingTapNdc)) {
    errors.push('pendingTapNdc must be null or [number, number]');
  }
  const NODE_MAP_INTENSITIES: NodeMapIntensity[] = ['off', 'subtle', 'full'];
  if (
    s.vizIntensity != null &&
    !NODE_MAP_INTENSITIES.includes(s.vizIntensity as NodeMapIntensity)
  ) {
    errors.push(
      `vizIntensity must be one of ${NODE_MAP_INTENSITIES.join(', ')}`,
    );
  }
  if (s.reduceMotion != null && typeof s.reduceMotion !== 'boolean') {
    errors.push('reduceMotion must be a boolean');
  }
  const validEvents = ['tapCitation', 'chunkAccepted', 'warning', 'tapCard'];
  if (s.lastEvent != null && !validEvents.includes(s.lastEvent as string)) {
    errors.push(
      'lastEvent must be tapCitation | chunkAccepted | warning | tapCard | null',
    );
  }
  if (
    s.lastEventTime != null &&
    (typeof s.lastEventTime !== 'number' || Number.isNaN(s.lastEventTime))
  ) {
    errors.push('lastEventTime must be a number');
  }
  if (
    typeof s.rulesClusterCount !== 'number' ||
    s.rulesClusterCount < 0 ||
    s.rulesClusterCount > maxPerCluster
  ) {
    errors.push(`rulesClusterCount must be 0..${maxPerCluster}`);
  }
  if (
    typeof s.cardsClusterCount !== 'number' ||
    s.cardsClusterCount < 0 ||
    s.cardsClusterCount > maxPerCluster
  ) {
    errors.push(`cardsClusterCount must be 0..${maxPerCluster}`);
  }
  if (
    typeof s.layerCount !== 'number' ||
    s.layerCount < 0 ||
    s.layerCount > 4
  ) {
    errors.push('layerCount must be 0..4');
  }
  if (!inRange(s.deconWeight as number, 0, 1)) {
    errors.push('deconWeight must be in [0,1]');
  }
  if (s.planeOpacity != null && !inRange(s.planeOpacity as number, 0, 1)) {
    errors.push('planeOpacity must be in [0,1]');
  }
  if (s.driftPx != null && (typeof s.driftPx !== 'number' || s.driftPx < 0)) {
    errors.push('driftPx must be a non-negative number');
  }
  if (s.touchFieldActive != null && typeof s.touchFieldActive !== 'boolean') {
    errors.push('touchFieldActive must be a boolean');
  }
  if (s.touchFieldNdc !== null && !Array.isArray(s.touchFieldNdc)) {
    errors.push('touchFieldNdc must be null or [number, number]');
  }
  if (
    s.touchFieldStrength != null &&
    !inRange(s.touchFieldStrength as number, 0, 1)
  ) {
    errors.push('touchFieldStrength must be in [0,1]');
  }
  const validZoneArmed = [null, 'rules', 'cards'];
  if (
    s.zoneArmed != null &&
    !validZoneArmed.includes(s.zoneArmed as 'rules' | 'cards' | null)
  ) {
    errors.push('zoneArmed must be null, "rules", or "cards"');
  }

  if (!inRange(s.postFxVignette as number, 0, 1)) {
    warnings.push('postFxVignette should be in [0,1]');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
