/**
 * Node map state: createDefaultNodeMapRef and validateVizState.
 */

import { createDefaultNodeMapRef } from '../src/nodeMap/types';
import { validateVizState } from '../src/utils/validateVizState';

describe('createDefaultNodeMapRef', () => {
  it('returns object with required fields', () => {
    const ref = createDefaultNodeMapRef();
    expect(ref).toHaveProperty('clock', 0);
    expect(ref).toHaveProperty('activity', 0);
    expect(ref).toHaveProperty('targetActivity', 0.1);
    expect(Array.isArray(ref.pulsePositions)).toBe(true);
    expect(ref.pulsePositions).toHaveLength(3);
    expect(Array.isArray(ref.pulseTimes)).toBe(true);
    expect(ref.pulseTimes).toHaveLength(3);
    expect(ref.currentMode).toBe('idle');
  });
});

describe('validateVizState', () => {
  it('accepts valid default ref', () => {
    const ref = createDefaultNodeMapRef();
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
    const ref = createDefaultNodeMapRef();
    (ref as { currentMode: string }).currentMode = 'invalid';
    const result = validateVizState(ref);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('currentMode'))).toBe(true);
  });

  it('rejects activity out of range', () => {
    const ref = createDefaultNodeMapRef();
    ref.activity = 1.5;
    const result = validateVizState(ref);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('activity'))).toBe(true);
  });
});
