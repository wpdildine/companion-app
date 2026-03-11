/**
 * Scene layer keys that own render order in scene.layers.
 * Single source for GL_SCENE_LAYER_KEYS and GLSceneLayerId.
 */

export const GL_SCENE_LAYER_KEYS = [
  'background',
  'backPlane',
  'spineLightCore',
  'spineBase',
  'spineShards',
  'glyphsBack',
  'links',
  'glyphsFront',
  'spineRot',
  'debugOverlay',
] as const;

export type GLSceneLayerId = (typeof GL_SCENE_LAYER_KEYS)[number];
