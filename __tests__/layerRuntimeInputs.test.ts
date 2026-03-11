import { createDefaultVisualizationRef } from '../src/visualization/engine/createDefaultRef';
import { getLayerRuntimeInputs } from '../src/visualization/engine/layerRuntimeInputs';

describe('getLayerRuntimeInputs', () => {
  it('projects canonical ref state into a shared read surface', () => {
    const ref = createDefaultVisualizationRef();
    ref.activity = 0.5;
    ref.currentMode = 'processing';
    ref.clock = 12;
    ref.lastEvent = 'chunkAccepted';
    ref.rulesClusterCount = 3;
    ref.cardsClusterCount = 2;
    ref.hueShift = 0.07;

    const runtime = getLayerRuntimeInputs(ref);

    expect(runtime.activity).toBe(0.5);
    expect(runtime.mode).toBe('processing');
    expect(runtime.clock).toBe(12);
    expect(runtime.lastEvent).toBe('chunkAccepted');
    expect(runtime.rulesClusterCount).toBe(3);
    expect(runtime.cardsClusterCount).toBe(2);
    expect(runtime.hueShift).toBe(0.07);
  });

  it('returns empty values when no ref is available', () => {
    expect(getLayerRuntimeInputs(null)).toEqual({});
  });
});
