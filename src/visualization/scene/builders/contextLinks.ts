import { CONTEXT_LINKS_ART_DIRECTION } from '../artDirection/contextLinksArtDirection';
import type { GLSceneContextLinks } from '../sceneFormations';

/**
 * Build scene descriptor for ContextLinks from art direction.
 */
export function buildContextLinksDescription(): GLSceneContextLinks {
  const a = CONTEXT_LINKS_ART_DIRECTION;
  return {
    pulseSpeed: a.pulseSpeed,
    alphaScale: a.alphaScale,
    showConfidenceBelow: a.showConfidenceBelow,
    requireFullIntensity: a.requireFullIntensity,
    bezierControlXAmp: a.bezier.controlXAmp,
    bezierControlYAmp: a.bezier.controlYAmp,
    bezierControlZAmp: a.bezier.controlZAmp,
  };
}
