import { getSceneDescription } from '../src/visualization/scene/sceneFormations';
import { createDefaultVisualizationRef } from '../src/visualization/runtime/createDefaultRef';
import {
  setVisualizationScene,
  subscribeVisualizationScene,
  updateVisualizationLayerDescriptors,
} from '../src/visualization/runtime/applySceneUpdates';

describe('sceneUpdates', () => {
  it('sets the scene and notifies subscribers', () => {
    const ref = createDefaultVisualizationRef();
    const listener = jest.fn();
    const unsubscribe = subscribeVisualizationScene(ref, listener);

    setVisualizationScene(ref, getSceneDescription());

    expect(ref.scene).toBeDefined();
    expect(ref.sceneRevision).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('updates layer descriptors and notifies subscribers', () => {
    const ref = createDefaultVisualizationRef();
    setVisualizationScene(ref, getSceneDescription());
    const listener = jest.fn();
    const unsubscribe = subscribeVisualizationScene(ref, listener);

    updateVisualizationLayerDescriptors(ref, current =>
      current.map(d => (d.id === 'contextLinks' ? { ...d, enabled: false } : d)),
    );

    expect(
      ref.scene?.layerDescriptors.find(d => d.id === 'contextLinks')?.enabled,
    ).toBe(false);
    expect(ref.sceneRevision).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
