import type { RefObject } from 'react';
import type { GLSceneDescription } from '../scene/sceneFormations';
import type { LayerDescriptor } from '../scene/layerDescriptor';
import type { VisualizationEngineRef } from './runtimeTypes';

type SceneListener = () => void;

function resolveVisualizationRef(
  refOrValue: RefObject<VisualizationEngineRef | null> | VisualizationEngineRef | null,
): VisualizationEngineRef | null {
  if (refOrValue && typeof refOrValue === 'object' && 'current' in refOrValue) {
    return refOrValue.current;
  }
  return refOrValue;
}

function notifySceneListeners(ref: VisualizationEngineRef): void {
  ref.sceneRevision += 1;
  for (const listener of ref.sceneListeners) {
    listener();
  }
}

export function setVisualizationScene(
  refOrValue: RefObject<VisualizationEngineRef | null> | VisualizationEngineRef | null,
  scene: GLSceneDescription,
): void {
  const ref = resolveVisualizationRef(refOrValue);
  if (!ref) return;
  ref.scene = scene;
  notifySceneListeners(ref);
}

export function updateVisualizationLayerDescriptors(
  refOrValue: RefObject<VisualizationEngineRef | null> | VisualizationEngineRef | null,
  updater:
    | LayerDescriptor[]
    | ((current: LayerDescriptor[]) => LayerDescriptor[]),
): void {
  const ref = resolveVisualizationRef(refOrValue);
  if (!ref?.scene) return;
  const current = ref.scene.layerDescriptors ?? [];
  ref.scene.layerDescriptors =
    typeof updater === 'function' ? updater(current) : updater;
  notifySceneListeners(ref);
}

export function subscribeVisualizationScene(
  refOrValue: RefObject<VisualizationEngineRef | null> | VisualizationEngineRef | null,
  listener: SceneListener,
): () => void {
  const ref = resolveVisualizationRef(refOrValue);
  if (!ref) return () => {};
  ref.sceneListeners.add(listener);
  return () => {
    ref.sceneListeners.delete(listener);
  };
}
