/**
 * Render-side event pulse helper.
 * Derives a pulse for lastEvent using scene anchors and transient modulation.
 */

import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';
import type { GLSceneDescription } from '../../scene/sceneFormations';
import { getPulseColorWithHue } from '../../runtime/getPulseColor';
import { computeTransientModulation } from './transientModulation';

const EVENT_PULSE_DECAY_MS = 900;

export type EventPulse = {
  position: [number, number, number];
  color: [number, number, number];
  time: number;
};

export function getEventPulse(
  v: VisualizationEngineRef,
  scene: GLSceneDescription | undefined,
): EventPulse | null {
  if (!scene || !v.lastEvent || v.lastEventTime <= 0) return null;
  const ageMs = (v.clock - v.lastEventTime) * 1000;
  if (ageMs < 0 || ageMs >= EVENT_PULSE_DECAY_MS) return null;

  const anchors = scene.pulseAnchors;
  let position: [number, number, number] = anchors.center;
  if (
    v.lastEvent === 'tapCitation' ||
    v.lastEvent === 'chunkAccepted' ||
    v.lastEvent === 'firstToken'
  ) {
    position = anchors.rules;
  } else if (v.lastEvent === 'tapCard') {
    position = anchors.cards;
  }

  const modulation = computeTransientModulation(
    v.lastEvent,
    v.lastEventTime,
    v.clock,
    scene.transientEffects,
  );
  const baseHueShift = v.hueShift + modulation.hueShift;
  let color = getPulseColorWithHue(v.paletteId, baseHueShift, null, v.currentMode);
  if (
    v.lastEvent === 'tapCitation' ||
    v.lastEvent === 'tapCard' ||
    v.lastEvent === 'chunkAccepted' ||
    v.lastEvent === 'firstToken' ||
    v.lastEvent === 'warning'
  ) {
    color = getPulseColorWithHue(v.paletteId, v.hueShift, v.lastEvent, v.currentMode);
  } else if (modulation.intensity > 0) {
    color = [
      Math.min(1, color[0] * (1 + modulation.intensity)),
      Math.min(1, color[1] * (1 + modulation.intensity)),
      Math.min(1, color[2] * (1 + modulation.intensity)),
    ];
  }

  return { position, color, time: v.lastEventTime };
}

export function injectEventPulse(
  positions: [number, number, number][],
  times: number[],
  colors: [number, number, number][],
  pulse: EventPulse | null,
): void {
  if (!pulse) return;
  let idx = 0;
  for (let i = 1; i < times.length; i++) {
    if (times[i] < times[idx]) idx = i;
  }
  positions[idx] = pulse.position;
  times[idx] = pulse.time;
  colors[idx] = pulse.color;
}
