/**
 * Render-side transient modulation helper.
 * Uses event identity + timing + scene transient definitions to derive modulation.
 */

import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';
import type { GLSceneTransientEffects } from '../../scene/sceneFormations';
import type { TransientModulation } from '../../scene/artDirection/transientEffects';
import { ZERO_MODULATION } from '../../scene/artDirection/transientEffects';

export function computeTransientModulation(
  eventId: VisualizationEngineRef['lastEvent'],
  eventTimeSeconds: number,
  clockSeconds: number,
  effects: GLSceneTransientEffects | undefined,
): TransientModulation {
  if (!effects || !eventId) return ZERO_MODULATION;
  const effect =
    eventId === 'softFail'
      ? effects.softFail
      : eventId === 'firstToken'
        ? effects.firstToken
        : null;
  if (!effect) return ZERO_MODULATION;
  const ageMs = (clockSeconds - eventTimeSeconds) * 1000;
  if (ageMs < 0 || ageMs >= effect.decayMs) return ZERO_MODULATION;
  const t = 1 - ageMs / effect.decayMs;
  return {
    hueShift: effect.modulation.hueShift * t,
    intensity: effect.modulation.intensity * t,
    agitation: effect.modulation.agitation * t,
    opacityBias: effect.modulation.opacityBias * t,
  };
}

export function scaleModulation(
  modulation: TransientModulation,
  weights: TransientModulation | undefined,
): TransientModulation {
  if (!weights) return modulation;
  return {
    hueShift: modulation.hueShift * weights.hueShift,
    intensity: modulation.intensity * weights.intensity,
    agitation: modulation.agitation * weights.agitation,
    opacityBias: modulation.opacityBias * weights.opacityBias,
  };
}
