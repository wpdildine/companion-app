/**
 * Scene contract validation. Separate from engine/validateVizState (engine ref).
 * Used by Spine (and optionally at scene assignment) to dev-assert scene shape.
 */

import type { GLSceneDescription } from './formations';
import { GL_SCENE_LAYER_KEYS } from './formations';

const CANONICAL_KEYS = ['idle', 'listening', 'processing', 'speaking'] as const;

/**
 * Returns true if scene has valid spine and required canonical profile keys.
 * In __DEV__, logs and returns false when invalid.
 */
export function validateSceneDescription(
  scene: GLSceneDescription | undefined,
): boolean {
  if (!scene) return false;
  const spine = scene.spine;
  if (!spine) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneDescription] scene.spine is missing.');
    }
    return false;
  }
  if (spine.planeCount !== 5) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneDescription] scene.spine.planeCount must be 5, got',
        spine.planeCount,
      );
    }
    return false;
  }
  const planes = spine.planes;
  if (!Array.isArray(planes) || planes.length !== spine.planeCount) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneDescription] scene.spine.planes must be array of length planeCount.',
      );
    }
    return false;
  }
  for (let i = 0; i < planes.length; i++) {
    if (planes[i] == null || typeof (planes[i] as { z?: number }).z !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneDescription] scene.spine.planes[].z must be number.');
      }
      return false;
    }
  }
  const env = spine.envelopeNdc;
  if (!env || typeof env.width !== 'number' || typeof env.height !== 'number' || typeof env.centerY !== 'number') {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneDescription] scene.spine.envelopeNdc (width, height, centerY) is missing or invalid.');
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
        '[validateSceneDescription] scene.spine.style plane arrays must exist and match planeCount.',
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
        '[validateSceneDescription] scene.spine.style numeric fields are missing or invalid.',
      );
    }
    return false;
  }
  for (const key of CANONICAL_KEYS) {
    if (!spine.spreadProfiles[key] || !spine.halftoneProfiles[key]) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(
          '[validateSceneDescription] scene.spine.spreadProfiles and halftoneProfiles must have keys: idle, listening, processing, speaking. Missing:',
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
        console.error('[validateSceneDescription] scene.spine.shards[].z must be number.');
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
          '[validateSceneDescription] scene.spine.shards[].zOffset must be in [-2.5, 2.5], got',
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
      console.error('[validateSceneDescription] scene.layers is missing.');
    }
    return false;
  }
  for (const key of GL_SCENE_LAYER_KEYS) {
    const section = scene.layers[key];
    if (!section || typeof section.renderOrderBase !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(
          '[validateSceneDescription] scene.layers must have each key with renderOrderBase number. Missing or invalid:',
          key,
        );
      }
      return false;
    }
  }
  const bp = scene.backgroundPlanes;
  if (!bp || !Array.isArray(bp.planes) || bp.planes.length !== bp.count) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneDescription] scene.backgroundPlanes.planes must be array of length backgroundPlanes.count.',
      );
    }
    return false;
  }
  for (let i = 0; i < bp.planes.length; i++) {
    const p = bp.planes[i];
    if (p == null || typeof p.z !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneDescription] scene.backgroundPlanes.planes[].z must be number.');
      }
      return false;
    }
  }
  if (!scene.presets) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneDescription] scene.presets is missing.');
    }
    return false;
  }
  for (const key of CANONICAL_KEYS) {
    if (!(key in scene.presets)) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneDescription] scene.presets must have key:', key);
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
      console.error('[validateSceneDescription] scene.touch is missing.');
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
      console.error('[validateSceneDescription] scene.touch.zones (left/right/center.strength) invalid.');
    }
    return false;
  }
  if (!centerRecordValid) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneDescription] scene.touch.zones.center.record must be boolean when present.',
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
      console.error('[validateSceneDescription] scene.touch.feedback invalid.');
    }
    return false;
  }
  const glyphRespValid =
    typeof t.glyphResponse?.repelStrength === 'number' &&
    typeof t.glyphResponse?.nudgeRadius === 'number' &&
    typeof t.glyphResponse?.parallaxBoost === 'number';
  if (!glyphRespValid) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneDescription] scene.touch.glyphResponse invalid.');
    }
    return false;
  }
  const spineRot = scene.spineRot;
  if (!spineRot) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneDescription] scene.spineRot is missing.');
    }
    return false;
  }
  const rotPlanes = spineRot.planes;
  if (!Array.isArray(rotPlanes)) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneDescription] scene.spineRot.planes must be an array.');
    }
    return false;
  }
  const maxPlanes = rotPlanes.length;
  for (let i = 0; i < rotPlanes.length; i++) {
    const p = rotPlanes[i];
    if (p == null || typeof p.z !== 'number' || typeof p.rotationZ !== 'number' ||
        typeof p.scaleX !== 'number' || typeof p.scaleY !== 'number') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[validateSceneDescription] scene.spineRot.planes[] must have z, rotationZ, scaleX, scaleY.');
      }
      return false;
    }
  }
  const planeCountByMode = spineRot.planeCountByMode;
  if (!planeCountByMode || typeof planeCountByMode !== 'object') {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneDescription] scene.spineRot.planeCountByMode is missing.');
    }
    return false;
  }
  for (const key of CANONICAL_KEYS) {
    const count = planeCountByMode[key as keyof typeof planeCountByMode];
    if (typeof count !== 'number' || count < 0 || count > maxPlanes) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(
          '[validateSceneDescription] scene.spineRot.planeCountByMode must have 0 <= count <= planes.length for each mode.',
        );
      }
      return false;
    }
  }
  if (typeof spineRot.opacityBase !== 'number') {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[validateSceneDescription] scene.spineRot.opacityBase must be a number.');
    }
    return false;
  }
  return true;
}
