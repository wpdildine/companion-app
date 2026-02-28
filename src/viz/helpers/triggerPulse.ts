/**
 * Public API: events (partial/final transcript, answer received) call triggerPulseAtCenter.
 * Sets next of 3 pulse slots (position = center, time = clock, color from getPulseColor).
 */

import type { RefObject } from 'react';
import type { VizEngineRef } from '../types';
import { getPulseColorWithHue } from './getPulseColor';

export function triggerPulseAtCenter(
  vizRef: RefObject<VizEngineRef | null>,
): void {
  const v = vizRef.current;
  if (!v) return;
  const i = v.lastPulseIndex % 3;
  v.pulsePositions[i] = [0, 0, 0];
  v.pulseTimes[i] = v.clock;
  v.pulseColors[i] = getPulseColorWithHue(
    v.paletteId,
    v.hueShift,
    'chunkAccepted',
    v.currentMode,
  );
  v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
}
