/**
 * Composes base + rot + shards + halftone (+ power) into single SPINE_ART_DIRECTION.
 * Single source for callers; do not import preset files from outside this folder.
 */

import { SPINE_BASE_PRESET, BASE_PLANE_RENDER_ORDER } from './spineBasePreset';
import { SPINE_HALFTONE_PRESET } from './spineHalftonePreset';
import { SPINE_LIGHT_CORE_PRESET } from './spineLightCorePreset';
import { SPINE_SHARD_PRESET } from './spineShardPreset';
import { SPINE_ROT_PRESET } from './spineRotPreset';

export { BASE_PLANE_RENDER_ORDER };

export const SPINE_ART_DIRECTION = {
  ...SPINE_BASE_PRESET,
  ...SPINE_HALFTONE_PRESET,
  ...SPINE_SHARD_PRESET,
  lightCore: SPINE_LIGHT_CORE_PRESET,
  rot: SPINE_ROT_PRESET,
} as const;
