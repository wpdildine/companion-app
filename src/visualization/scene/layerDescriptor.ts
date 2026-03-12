/**
 * Layer descriptor: mount identity (VisualizationMountId) and optional link to scene layer keys.
 * Render order lives only in scene.layers; descriptors reference it via sceneLayerKeys.
 * Do not conflate mount id (e.g. spine, contextLinks) with scene-layer key (e.g. spineBase, links).
 */

import type { GLSceneLayerId } from './glSceneLayerKeys';

/** Mount slots: which layer component to mount. Used in registry and layerDescriptors. */
export const VISUALIZATION_MOUNT_IDS = [
  'background',
  'backPlane',
  'spineLightCore',
  'spine',
  'contextLinks',
  'contextGlyphs',
  'touchZones',
] as const;

export type VisualizationMountId = (typeof VISUALIZATION_MOUNT_IDS)[number];

/** Descriptor identity = mount id; optionally points to scene.layers key(s) for render order. */
export interface LayerDescriptor {
  id: VisualizationMountId;
  enabled?: boolean;
  /** Scene layer key(s) this mount uses for render order. Component reads scene.layers[key].renderOrderBase. */
  sceneLayerKeys?: GLSceneLayerId[];
}

/** Canonical ordered list of layer descriptors (mount ids + sceneLayerKeys). Single source for getSceneDescription() and canvas fallback. */
export function getDefaultLayerDescriptors(): LayerDescriptor[] {
  return [
    { id: 'background', sceneLayerKeys: ['background'] },
    { id: 'backPlane', sceneLayerKeys: ['backPlane'] },
    { id: 'spineLightCore', sceneLayerKeys: ['spineLightCore'] },
    { id: 'spine', sceneLayerKeys: ['spineBase', 'spineShards', 'spineRot'] },
    { id: 'contextLinks', enabled: false, sceneLayerKeys: ['links'] },
    { id: 'contextGlyphs', enabled: false, sceneLayerKeys: ['glyphsBack', 'glyphsFront'] },
    { id: 'touchZones', sceneLayerKeys: ['debugOverlay'] },
  ];
}
