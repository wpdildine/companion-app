/**
 * Public API: events (partial/final transcript, answer received) call triggerPulseAtCenter.
 * Sets next of 3 pulse slots (position = center, time = clock, color from palette).
 */

import type { RefObject } from 'react';
import type { VizEngineRef } from '../types';

const PULSE_COLOR: [number, number, number] = [0.5, 0.25, 0.85];

export function triggerPulseAtCenter(
  vizRef: RefObject<VizEngineRef | null>,
): void {
  const v = vizRef.current;
  if (!v) return;
  const i = v.lastPulseIndex % 3;
  v.pulsePositions[i] = [0, 0, 0];
  v.pulseTimes[i] = v.clock;
  v.pulseColors[i] = [...PULSE_COLOR];
  v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
}
