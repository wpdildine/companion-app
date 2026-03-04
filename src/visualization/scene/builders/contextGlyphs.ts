import { CONTEXT_GLYPHS_ART_DIRECTION } from '../artDirection/contextGlyphsArtDirection';
import type { GLSceneContextGlyphs } from '../formations';

/**
 * Build scene descriptor for ContextGlyphs from art direction.
 */
export function buildContextGlyphsDescription(): Omit<
  GLSceneContextGlyphs,
  'zHierarchy'
> {
  const a = CONTEXT_GLYPHS_ART_DIRECTION;
  return {
    baseNodeSize: a.baseNodeSize,
    pulseSpeed: a.pulseSpeed,
    touchRadius: a.touchRadius,
    touchStrength: a.touchStrength,
    touchMaxOffset: a.touchMaxOffset,
    zLayerOffsets: [...a.zLayers.offsets],
    zLayerJitter: a.zLayers.jitter,
    rulesClusterZBias: a.zLayers.rulesClusterBias,
    cardsClusterZBias: a.zLayers.cardsClusterBias,
    decayPhaseSeed: a.decay.phaseSeed,
    decayRateSeed: a.decay.rateSeed,
    decayDepthSeed: a.decay.depthSeed,
    decayRateMin: a.decay.rateMin,
    decayRateMax: a.decay.rateMax,
    decayDepthMin: a.decay.depthMin,
    decayDepthMax: a.decay.depthMax,
  };
}
