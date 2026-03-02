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
    style.planeOffsetX.length === spine.planeCount &&
    style.planeWidthScale.length === spine.planeCount &&
    style.planeOpacityScale.length === spine.planeCount;
  if (!styleArraysValid) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(
        '[validateSceneDescription] scene.spine.style plane arrays must exist and match planeCount.',
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
