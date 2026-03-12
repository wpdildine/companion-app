/**
 * Scene contract validation. Separate from runtime/validateVizState (runtime ref).
 * Used by Spine (and optionally at scene assignment) to dev-assert scene shape.
 */

import type { GLSceneDescription } from './sceneFormations';
import { GL_SCENE_LAYER_KEYS } from './sceneFormations';
import { VISUALIZATION_MOUNT_IDS } from './layerDescriptor';

const CANONICAL_KEYS = ['idle', 'listening', 'processing', 'speaking'] as const;

/**
 * Returns true if scene has valid spine and required canonical profile keys.
 * In __DEV__, logs and returns false when invalid.
 */
export function validateSceneSpec(
  scene: GLSceneDescription | undefined,
): boolean {
  if (!scene) return false;
  const spine = scene.spine;
  if (!spine) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.spine is missing.');
    }
    return false;
  }
  if (spine.planeCount !== 5) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneSpec] scene.spine.planeCount must be 5, got',
        spine.planeCount,
      );
    }
    return false;
  }
  const planes = spine.planes;
  if (!Array.isArray(planes) || planes.length !== spine.planeCount) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneSpec] scene.spine.planes must be array of length planeCount.',
      );
    }
    return false;
  }
  for (let i = 0; i < planes.length; i++) {
    if (planes[i] == null || typeof (planes[i] as { z?: number }).z !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.spine.planes[].z must be number.');
      }
      return false;
    }
  }
  const env = spine.envelopeNdc;
  if (!env || typeof env.width !== 'number' || typeof env.height !== 'number' || typeof env.centerY !== 'number') {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.spine.envelopeNdc (width, height, centerY) is missing or invalid.');
    }
    return false;
  }
  const style = spine.style;
  const styleArraysValid =
    Array.isArray(style?.planeOffsetX) &&
    Array.isArray(style?.planeWidthScale) &&
    Array.isArray(style?.planeOpacityScale) &&
    Array.isArray(style?.planeOffsetY) &&
    Array.isArray(style?.planeHeightScale) &&
    Array.isArray(style?.planeColors) &&
    (!style.planeZOffset || (Array.isArray(style.planeZOffset) && style.planeZOffset.length === spine.planeCount)) &&
    (!style.planeRenderOrder || (Array.isArray(style.planeRenderOrder) && style.planeRenderOrder.length === spine.planeCount)) &&
    (!style.planeAccent || (Array.isArray(style.planeAccent) && style.planeAccent.length === spine.planeCount)) &&
    style.planeOffsetX.length === spine.planeCount &&
    style.planeWidthScale.length === spine.planeCount &&
    style.planeOpacityScale.length === spine.planeCount &&
    style.planeOffsetY.length === spine.planeCount &&
    style.planeHeightScale.length === spine.planeCount &&
    style.planeColors.length === spine.planeCount;
  if (!styleArraysValid) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneSpec] scene.spine.style plane arrays must exist and match planeCount.',
      );
    }
    return false;
  }
  const numericStyleValid =
    typeof style.opacityBoostFromHalftone === 'number' &&
    style.opacityBoostFromHalftone >= 0 &&
    typeof style.halftoneOpacityScale === 'number' &&
    style.halftoneOpacityScale > 0 &&
    typeof style.shardOpacityScale === 'number' &&
    style.shardOpacityScale > 0 &&
    typeof style.halftoneDebugFlat === 'boolean' &&
    typeof style.overlayDistance === 'number' &&
    style.overlayDistance > 0 &&
    typeof style.zStep === 'number' &&
    typeof style.planeGap === 'number' &&
    typeof style.driftAmpX === 'number' &&
    typeof style.driftAmpY === 'number' &&
    typeof style.perPlaneDriftScale === 'number' &&
    typeof style.perPlaneDriftPhaseStep === 'number' &&
    typeof style.driftHz === 'number' &&
    typeof style.idleBreathAmp === 'number' &&
    typeof style.idleBreathHz === 'number' &&
    style.idleBreathHz > 0 &&
    typeof style.processingOverflowBoost === 'number' &&
    style.processingOverflowBoost >= 1 &&
    typeof style.processingExtraOverlap === 'number' &&
    typeof style.processingHeightBoost === 'number' &&
    style.processingHeightBoost >= 1 &&
    typeof style.processingMotionBoost === 'number' &&
    style.processingMotionBoost >= 1 &&
    typeof style.processingEdgeBoost === 'number' &&
    style.processingEdgeBoost >= 1 &&
    typeof style.shardWidthScale === 'number' &&
    style.shardWidthScale > 0 &&
    typeof style.edgeBandWidth === 'number' &&
    style.edgeBandWidth > 0 &&
    style.edgeBandWidth < 0.5 &&
    typeof style.edgeOpacity === 'number' &&
    typeof style.edgeGlowStrength === 'number' &&
    typeof style.edgeGlowWidth === 'number' &&
    typeof style.edgeGlowColor === 'string' &&
    typeof style.beamHalfWidthFrac === 'number' &&
    typeof style.edgeYWeight === 'number' &&
    typeof style.halftoneEnabled === 'boolean' &&
    (style.halftoneFadeMode == null || (typeof style.halftoneFadeMode === 'string' && ['none', 'radial', 'linear', 'angled'].includes(style.halftoneFadeMode))) &&
    (style.halftoneFadeInner == null || typeof style.halftoneFadeInner === 'number') &&
    (style.halftoneFadeOuter == null || typeof style.halftoneFadeOuter === 'number') &&
    (style.halftoneFadePower == null || typeof style.halftoneFadePower === 'number') &&
    (style.halftoneFadeAngle == null || typeof style.halftoneFadeAngle === 'number') &&
    (style.halftoneFadeOffset == null || typeof style.halftoneFadeOffset === 'number') &&
    (style.halftoneFadeCenterX == null || typeof style.halftoneFadeCenterX === 'number') &&
    (style.halftoneFadeCenterY == null || typeof style.halftoneFadeCenterY === 'number') &&
    (style.halftoneFadeLevels == null || typeof style.halftoneFadeLevels === 'number') &&
    (style.halftoneFadeStepMix == null || typeof style.halftoneFadeStepMix === 'number') &&
    (style.halftoneFadeOneSided == null || typeof style.halftoneFadeOneSided === 'boolean');
  if (!numericStyleValid) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneSpec] scene.spine.style numeric fields are missing or invalid.',
      );
    }
    return false;
  }
  for (const key of CANONICAL_KEYS) {
    if (!spine.spreadProfiles[key] || !spine.halftoneProfiles[key]) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(
          '[validateSceneSpec] scene.spine.spreadProfiles and halftoneProfiles must have keys: idle, listening, processing, speaking. Missing:',
          key,
        );
      }
      return false;
    }
  }
  const shards = spine.shards ?? [];
  for (let s = 0; s < shards.length; s++) {
    const shard = shards[s];
    if (shard && typeof shard.z !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.spine.shards[].z must be number.');
      }
      return false;
    }
    if (
      shard &&
      typeof shard.zOffset === 'number' &&
      (shard.zOffset < -2.5 || shard.zOffset > 2.5)
    ) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(
          '[validateSceneSpec] scene.spine.shards[].zOffset must be in [-2.5, 2.5], got',
          shard.zOffset,
          'at index',
          s,
        );
      }
      return false;
    }
  }
  if (!scene.layers) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.layers is missing.');
    }
    return false;
  }
  for (const key of GL_SCENE_LAYER_KEYS) {
    const section = scene.layers[key];
    if (!section || typeof section.renderOrderBase !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(
          '[validateSceneSpec] scene.layers must have each key with renderOrderBase number. Missing or invalid:',
          key,
        );
      }
      return false;
    }
  }
  if (scene.layerDescriptors != null) {
    if (!Array.isArray(scene.layerDescriptors)) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.layerDescriptors must be an array.');
      }
      return false;
    }
    for (let i = 0; i < scene.layerDescriptors.length; i++) {
      const d = scene.layerDescriptors[i];
      if (!d || typeof d.id !== 'string') {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.error('[validateSceneSpec] scene.layerDescriptors[].id must be a string (VisualizationMountId).', i);
        }
        return false;
      }
      if (!VISUALIZATION_MOUNT_IDS.includes(d.id as (typeof VISUALIZATION_MOUNT_IDS)[number])) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.error('[validateSceneSpec] scene.layerDescriptors[].id must be a valid VisualizationMountId.', d.id);
        }
        return false;
      }
      if (d.enabled !== undefined && typeof d.enabled !== 'boolean') {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.error('[validateSceneSpec] scene.layerDescriptors[].enabled must be boolean if present.', i);
        }
        return false;
      }
      if (d.sceneLayerKeys != null) {
        if (!Array.isArray(d.sceneLayerKeys)) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.error('[validateSceneSpec] scene.layerDescriptors[].sceneLayerKeys must be an array if present.', i);
          }
          return false;
        }
        for (const key of d.sceneLayerKeys) {
          if (!(key in scene.layers)) {
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.error('[validateSceneSpec] scene.layerDescriptors[].sceneLayerKeys must only contain keys that exist in scene.layers.', key);
            }
            return false;
          }
        }
      }
    }
  }
  const bp = scene.backgroundPlanes;
  if (!bp || !Array.isArray(bp.planes) || bp.planes.length !== bp.count) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneSpec] scene.backgroundPlanes.planes must be array of length backgroundPlanes.count.',
      );
    }
    return false;
  }
  for (let i = 0; i < bp.planes.length; i++) {
    const p = bp.planes[i];
    if (p == null || typeof p.z !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.backgroundPlanes.planes[].z must be number.');
      }
      return false;
    }
  }
  const backPlane = scene.backPlane;
  if (!backPlane || typeof backPlane.count !== 'number' || backPlane.count < 0) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.backPlane is missing or backPlane.count is invalid.');
    }
    return false;
  }
  if (!Array.isArray(backPlane.planes) || backPlane.planes.length !== backPlane.count) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.backPlane.planes must be array of length backPlane.count.');
    }
    return false;
  }
  for (let i = 0; i < backPlane.planes.length; i++) {
    const p = backPlane.planes[i];
    if (p == null || typeof p.z !== 'number' || typeof p.opacityBase !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.backPlane.planes[] must have z and opacityBase.');
      }
      return false;
    }
  }
  if (!scene.presets) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.presets is missing.');
    }
    return false;
  }
  for (const key of CANONICAL_KEYS) {
    if (!(key in scene.presets)) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.presets must have key:', key);
      }
      return false;
    }
    const entry = scene.presets[key as keyof typeof scene.presets];
    if (entry?.background) {
      const b = entry.background;
      if (b.driftSpeedScale != null && typeof b.driftSpeedScale !== 'number') return false;
      if (b.maskContrastScale != null && typeof b.maskContrastScale !== 'number') return false;
      if (b.vignetteScale != null && typeof b.vignetteScale !== 'number') return false;
      if (b.halftoneDensityScale != null && typeof b.halftoneDensityScale !== 'number') return false;
    }
    if (entry?.spine) {
      const s = entry.spine;
      if (s?.opacityScale != null && typeof s.opacityScale !== 'number') return false;
      if (s?.breathAmplitudeScale != null && typeof s.breathAmplitudeScale !== 'number') return false;
      if (s?.shardCountScale != null && typeof s.shardCountScale !== 'number') return false;
      if (s?.emissiveScale != null && typeof s.emissiveScale !== 'number') return false;
    }
  }
  if (!scene.touch) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.touch is missing.');
    }
    return false;
  }
  const t = scene.touch;
  const zonesValid =
    t.zones &&
    typeof t.zones.left?.attract === 'boolean' &&
    typeof t.zones.left?.strength === 'number' &&
    (t.zones.left?.record == null || typeof t.zones.left?.record === 'boolean') &&
    typeof t.zones.right?.attract === 'boolean' &&
    typeof t.zones.right?.strength === 'number' &&
    (t.zones.right?.record == null || typeof t.zones.right?.record === 'boolean') &&
    typeof t.zones.center?.attract === 'boolean' &&
    typeof t.zones.center?.strength === 'number';
  const centerRecordValid =
    t.zones &&
    (t.zones.center?.record == null ||
      typeof t.zones.center?.record === 'boolean');
  if (!zonesValid) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.touch.zones (left/right/center.strength) invalid.');
    }
    return false;
  }
  if (!centerRecordValid) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneSpec] scene.touch.zones.center.record must be boolean when present.',
      );
    }
    return false;
  }
  const feedbackValid =
    typeof t.feedback?.maxShear === 'number' &&
    typeof t.feedback?.maxRotateZ === 'number' &&
    typeof t.feedback?.damping === 'number' &&
    typeof t.feedback?.spring === 'number';
  if (!feedbackValid) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.touch.feedback invalid.');
    }
    return false;
  }
  const glyphRespValid =
    typeof t.glyphResponse?.repelStrength === 'number' &&
    typeof t.glyphResponse?.nudgeRadius === 'number' &&
    typeof t.glyphResponse?.parallaxBoost === 'number';
  if (!glyphRespValid) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.touch.glyphResponse invalid.');
    }
    return false;
  }
  const spineLightCore = scene.spineLightCore;
  if (!spineLightCore) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.spineLightCore is missing.');
    }
    return false;
  }
  const lightCoreModeKeys = ['idle', 'listening', 'processing', 'speaking'] as const;
  if (
    typeof spineLightCore.enabled !== 'boolean' ||
    typeof spineLightCore.color !== 'string' ||
    typeof spineLightCore.orbColor !== 'string' ||
    typeof spineLightCore.opacityBase !== 'number' ||
    typeof spineLightCore.widthScale !== 'number' ||
    typeof spineLightCore.heightScale !== 'number' ||
    typeof spineLightCore.zOffset !== 'number' ||
    typeof spineLightCore.orbStrength !== 'number' ||
    typeof spineLightCore.orbRadius !== 'number' ||
    typeof spineLightCore.orbFalloff !== 'number' ||
    typeof spineLightCore.orbCenterY !== 'number' ||
    typeof spineLightCore.orbDebugObvious !== 'boolean' ||
    typeof spineLightCore.orbDebugMultiplier !== 'number' ||
    typeof spineLightCore.warpAmpX !== 'number' ||
    typeof spineLightCore.warpAmpY !== 'number' ||
    typeof spineLightCore.warpFreq !== 'number' ||
    (spineLightCore.blend !== 'additive' && spineLightCore.blend !== 'normal')
  ) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneSpec] scene.spineLightCore fields (enabled/color/orbColor/opacityBase/widthScale/heightScale/zOffset/blend) are invalid.',
      );
    }
    return false;
  }
  for (const key of lightCoreModeKeys) {
    const opacity = spineLightCore.opacityByMode?.[key];
    const warpScale = spineLightCore.warpScaleByMode?.[key];
    if (typeof opacity !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.spineLightCore.opacityByMode is invalid for key:', key);
      }
      return false;
    }
    if (typeof warpScale !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.spineLightCore.warpScaleByMode is invalid for key:', key);
      }
      return false;
    }
  }
  const mw = spineLightCore.modulationWeights;
  if (
    !mw ||
    typeof mw.hueShift !== 'number' ||
    typeof mw.intensity !== 'number' ||
    typeof mw.agitation !== 'number' ||
    typeof mw.opacityBias !== 'number'
  ) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.spineLightCore.modulationWeights is invalid.');
    }
    return false;
  }
  if (typeof spineLightCore.modulationTintColor !== 'string') {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.spineLightCore.modulationTintColor must be a string.');
    }
    return false;
  }
  const spineRot = scene.spineRot;
  if (!spineRot) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.spineRot is missing.');
    }
    return false;
  }
  const transientEffects = scene.transientEffects;
  if (!transientEffects) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.transientEffects is missing.');
    }
    return false;
  }
  if (transientEffects.softFail != null) {
    const sf = transientEffects.softFail;
    const valid =
      typeof sf.decayMs === 'number' &&
      typeof sf.modulation?.hueShift === 'number' &&
      typeof sf.modulation?.intensity === 'number' &&
      typeof sf.modulation?.agitation === 'number' &&
      typeof sf.modulation?.opacityBias === 'number';
    if (!valid) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.transientEffects.softFail is invalid.');
      }
      return false;
    }
  }
  if (transientEffects.terminalFail != null) {
    const tf = transientEffects.terminalFail;
    const valid =
      typeof tf.decayMs === 'number' &&
      typeof tf.modulation?.hueShift === 'number' &&
      typeof tf.modulation?.intensity === 'number' &&
      typeof tf.modulation?.agitation === 'number' &&
      typeof tf.modulation?.opacityBias === 'number';
    if (!valid) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.transientEffects.terminalFail is invalid.');
      }
      return false;
    }
  }
  if (transientEffects.firstToken != null) {
    const ft = transientEffects.firstToken;
    const valid =
      typeof ft.decayMs === 'number' &&
      typeof ft.modulation?.hueShift === 'number' &&
      typeof ft.modulation?.intensity === 'number' &&
      typeof ft.modulation?.agitation === 'number' &&
      typeof ft.modulation?.opacityBias === 'number';
    if (!valid) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.transientEffects.firstToken is invalid.');
      }
      return false;
    }
  }
  const rotPlanes = spineRot.planes;
  if (!Array.isArray(rotPlanes)) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.spineRot.planes must be an array.');
    }
    return false;
  }
  const maxPlanes = rotPlanes.length;
  for (let i = 0; i < rotPlanes.length; i++) {
    const p = rotPlanes[i];
    if (p == null || typeof p.z !== 'number' || typeof p.rotationZ !== 'number' ||
        typeof p.scaleX !== 'number' || typeof p.scaleY !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.spineRot.planes[] must have z, rotationZ, scaleX, scaleY.');
      }
      return false;
    }
  }
  const planeCountByMode = spineRot.planeCountByMode;
  if (!planeCountByMode || typeof planeCountByMode !== 'object') {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.spineRot.planeCountByMode is missing.');
    }
    return false;
  }
  for (const key of CANONICAL_KEYS) {
    const count = planeCountByMode[key as keyof typeof planeCountByMode];
    if (typeof count !== 'number' || count < 0 || count > maxPlanes) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(
          '[validateSceneSpec] scene.spineRot.planeCountByMode must have 0 <= count <= planes.length for each mode.',
        );
      }
      return false;
    }
  }
  if (typeof spineRot.opacityBase !== 'number') {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.spineRot.opacityBase must be a number.');
    }
    return false;
  }
  const organism = scene.organism;
  if (!organism || typeof organism !== 'object') {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.organism is missing.');
    }
    return false;
  }
  if (
    typeof organism.presence !== 'number' ||
    organism.presence < 0 ||
    organism.presence > 1 ||
    !Number.isFinite(organism.presence)
  ) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.organism.presence must be in [0,1] and finite.');
    }
    return false;
  }
  if (
    typeof organism.focusBias !== 'number' ||
    organism.focusBias < -1 ||
    organism.focusBias > 1 ||
    !Number.isFinite(organism.focusBias)
  ) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.organism.focusBias must be in [-1,1] and finite.');
    }
    return false;
  }
  const ond = organism.ndc;
  if (
    !ond ||
    typeof ond.x !== 'number' ||
    typeof ond.y !== 'number' ||
    !Number.isFinite(ond.x) ||
    !Number.isFinite(ond.y)
  ) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.organism.ndc must be { x, y } with finite numbers.');
    }
    return false;
  }
  const validZone: (string | null)[] = [null, 'rules', 'neutral', 'cards'];
  if (organism.zone != null && !validZone.includes(organism.zone)) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneSpec] scene.organism.zone must be null, "rules", "neutral", or "cards".');
    }
    return false;
  }
  const motion = scene.motion;
  if (motion) {
    const scalars: (keyof typeof motion)[] = [
      'energy', 'tension', 'openness', 'settle', 'breath', 'attention', 'microMotion',
    ];
    for (const key of scalars) {
      const v = motion[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.error('[validateSceneSpec] scene.motion.' + key + ' must be finite number in [0,1].');
        }
        return false;
      }
    }
    const validPhase = ['enter', 'hold', 'exit'];
    if (!validPhase.includes(motion.phase)) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.motion.phase must be enter, hold, or exit.');
      }
      return false;
    }
    const pt = motion.phaseT;
    if (typeof pt !== 'number' || !Number.isFinite(pt) || pt < 0 || pt > 1) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneSpec] scene.motion.phaseT must be finite number in [0,1].');
      }
      return false;
    }
  }
  return true;
}
