/**
 * Spine light-core builder: single backlight beam behind the main spine stack.
 * Builder owns all light-core values; renderer stays dumb and consumes scene.spineLightCore only.
 */

import type { CanonicalSceneMode } from '../canonicalMode';
import { SPINE_ART_DIRECTION } from '../artDirection/spine';

export type GLSceneSpineLightCore = {
  enabled: boolean;
  color: string;
  opacityBase: number;
  widthScale: number;
  heightScale: number;
  zOffset: number;
  blend: 'additive' | 'normal';
  orbStrength: number;
  orbRadius: number;
  orbFalloff: number;
  orbCenterY: number;
  orbDebugObvious: boolean;
  orbDebugMultiplier: number;
  warpAmpX: number;
  warpAmpY: number;
  warpFreq: number;
  warpScaleByMode: Record<CanonicalSceneMode, number>;
  opacityByMode: Record<CanonicalSceneMode, number>;
};

export function buildSpineLightCore(): GLSceneSpineLightCore {
  const lightCore = SPINE_ART_DIRECTION.lightCore;
  return {
    enabled: lightCore.enabled,
    color: lightCore.color,
    opacityBase: lightCore.opacityBase,
    widthScale: lightCore.widthScale,
    heightScale: lightCore.heightScale,
    zOffset: lightCore.zOffset,
    blend: lightCore.blend,
    orbStrength: lightCore.orbStrength,
    orbRadius: lightCore.orbRadius,
    orbFalloff: lightCore.orbFalloff,
    orbCenterY: lightCore.orbCenterY,
    orbDebugObvious: lightCore.orbDebugObvious,
    orbDebugMultiplier: lightCore.orbDebugMultiplier,
    warpAmpX: lightCore.warpAmpX,
    warpAmpY: lightCore.warpAmpY,
    warpFreq: lightCore.warpFreq,
    warpScaleByMode: {
      idle: lightCore.warpScaleByMode.idle,
      listening: lightCore.warpScaleByMode.listening,
      processing: lightCore.warpScaleByMode.processing,
      speaking: lightCore.warpScaleByMode.speaking,
    },
    opacityByMode: {
      idle: lightCore.opacityByMode.idle,
      listening: lightCore.opacityByMode.listening,
      processing: lightCore.opacityByMode.processing,
      speaking: lightCore.opacityByMode.speaking,
    },
  };
}
