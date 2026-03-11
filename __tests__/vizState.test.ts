/**
 * Node map state: createDefaultVisualizationRef and validateVizState.
 */

import { createDefaultVisualizationRef } from '../src/visualization/engine/createDefaultRef';
import { validateVizState } from '../src/visualization/engine/validateVizState';

describe('createDefaultVisualizationRef', () => {
  it('returns object with required fields', () => {
    const ref = createDefaultVisualizationRef();
    expect(ref).toHaveProperty('clock', 0);
    expect(ref).toHaveProperty('activity', 0);
    expect(ref).toHaveProperty('targetActivity', 0.1);
    expect(Array.isArray(ref.pulsePositions)).toBe(true);
    expect(ref.pulsePositions).toHaveLength(3);
    expect(Array.isArray(ref.pulseTimes)).toBe(true);
    expect(ref.pulseTimes).toHaveLength(3);
    expect(ref.currentMode).toBe('idle');
    expect(ref.sceneRevision).toBe(0);
    expect(ref.sceneListeners).toBeInstanceOf(Set);
  });
});

describe('validateVizState', () => {
  it('accepts valid default ref', () => {
    const ref = createDefaultVisualizationRef();
    const result = validateVizState(ref);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects non-object', () => {
    const result = validateVizState(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid currentMode', () => {
    const ref = createDefaultVisualizationRef();
    (ref as { currentMode: string }).currentMode = 'invalid';
    const result = validateVizState(ref);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('currentMode'))).toBe(true);
  });

  it('rejects activity out of range', () => {
    const ref = createDefaultVisualizationRef();
    ref.activity = 1.5;
    const result = validateVizState(ref);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('activity'))).toBe(true);
  });
});
