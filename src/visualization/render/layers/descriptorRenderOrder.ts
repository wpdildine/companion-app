import type { LayerDescriptor } from '../../scene/layerDescriptor';
import type { GLSceneDescription, GLSceneLayerId } from '../../scene/formations';

export function getDescriptorRenderOrderBase(
  scene: GLSceneDescription | undefined,
  descriptor: LayerDescriptor | undefined,
  preferredKey: GLSceneLayerId,
  fallback: number,
): number {
  if (!scene?.layers) return fallback;
  const key = descriptor?.sceneLayerKeys?.includes(preferredKey)
    ? preferredKey
    : descriptor?.sceneLayerKeys?.[0] ?? preferredKey;
  return scene.layers[key]?.renderOrderBase ?? fallback;
}
