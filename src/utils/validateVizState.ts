/**
 * Validate VizEngineRef shape and ranges. Pure; no React/theme.
 * Use in __DEV__ or tests.
 */

import type { VizEngineRef, VizMode } from '../nodeMap/types';

const VIZ_MODES: VizMode[] = [
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

export function validateVizState(state: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

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
  if (typeof s.lastPulseIndex !== 'number' || s.lastPulseIndex < 0 || s.lastPulseIndex > 2) {
    errors.push('lastPulseIndex must be 0, 1, or 2');
  }
  if (!VIZ_MODES.includes(s.currentMode as VizMode)) {
    errors.push(`currentMode must be one of ${VIZ_MODES.join(', ')}`);
  }
  if (s.touchWorld !== null && !Array.isArray(s.touchWorld)) {
    errors.push('touchWorld must be null or [number, number, number]');
  }
  if (s.pendingTapNdc !== null && !Array.isArray(s.pendingTapNdc)) {
    errors.push('pendingTapNdc must be null or [number, number]');
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
