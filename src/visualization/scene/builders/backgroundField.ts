import { BACKGROUND_FIELD_ART_DIRECTION } from '../artDirection/backgroundFieldArtDirection';
import type { GLScenePlaneField } from '../formations';

/**
 * Build scene descriptor for background field from art direction.
 */
export function buildBackgroundFieldDescription(): GLScenePlaneField {
  const a = BACKGROUND_FIELD_ART_DIRECTION;
  return {
    opacityClampMin: a.opacityClampMin,
    opacityClampMax: a.opacityClampMax,
    noisePhaseSpeed: a.noisePhaseSpeed,
    smoothingSeconds: a.smoothingSeconds,
    radialFalloffStrength: a.radialFalloffStrength,
    vignetteScale: a.vignetteScale,
    slowDriftScale: a.slowDriftScale,
    valueVariation: a.valueVariation,
    intensityProcessingBase: a.intensity.processingBase,
    intensityProcessingActivityGain: a.intensity.processingActivityGain,
    intensityIdleBase: a.intensity.idleBase,
    intensityIdleActivityGain: a.intensity.idleActivityGain,
    thresholdBase: a.thresholdOscillation.base,
    thresholdAmp: a.thresholdOscillation.amp,
    thresholdHz: a.thresholdOscillation.hz,
    halftoneScaleBase: a.scaleOscillation.base,
    halftoneScaleAmp: a.scaleOscillation.amp,
    halftoneScaleHz: a.scaleOscillation.hz,
    basePlaneDepth: a.planeDepth.base,
    detailPlaneDepth: a.planeDepth.detail,
    basePlaneScale: a.planeScale.base,
    detailPlaneScale: a.planeScale.detail,
    panelOpacityScale: a.panel.opacityScale,
    answerOpacityScale: a.panel.answerOpacityScale,
    cardsOpacityScale: a.panel.cardsOpacityScale,
    rulesOpacityScale: a.panel.rulesOpacityScale,
    rulesHueShiftH: a.panel.rulesHueShift.h,
    rulesHueShiftS: a.panel.rulesHueShift.s,
    rulesHueShiftL: a.panel.rulesHueShift.l,
    answerPanelDepth: a.panel.depth.answer,
    cardsPanelDepth: a.panel.depth.cards,
    rulesPanelDepth: a.panel.depth.rules,
    modulationWeights: a.modulationWeights,
  };
}
