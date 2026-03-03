/**
 * Scene contract validation. Separate from utils/validateVizState (engine ref).
 * Used by Spine (and optionally at scene assignment) to dev-assert scene shape.
 */

import type { GLSceneDescription } from './formations';

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
    typeof style.halftoneEnabled === 'boolean';
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
  return true;
}
