import { createRef } from 'react';
import { applyVisualizationSignals } from './applyVisualizationSignals';
import { createDefaultVisualizationRef } from './createDefaultRef';
import {
  presetAllVizSubsystemsOn,
  setVizSubsystem,
} from '../../app/ui/components/overlays/vizSubsystemToggles';

describe('applyVisualizationSignals signalApply gate', () => {
  beforeEach(() => {
    presetAllVizSubsystemsOn();
  });

  it('produces no ref mutation when signalApply is off', () => {
    setVizSubsystem('signalApply', false);
    const ref = createRef<ReturnType<typeof createDefaultVisualizationRef>>();
    ref.current = createDefaultVisualizationRef();
    const beforeMode = ref.current.currentMode;
    const beforeSnapshot = ref.current.signalsSnapshot;

    applyVisualizationSignals(ref, {
      phase: 'processing',
      mode: 'processing',
    });

    expect(ref.current.currentMode).toBe(beforeMode);
    expect(ref.current.signalsSnapshot).toEqual(beforeSnapshot);
  });

  it('applies phase when signalApply is on', () => {
    const ref = createRef<ReturnType<typeof createDefaultVisualizationRef>>();
    ref.current = createDefaultVisualizationRef();
    applyVisualizationSignals(ref, { phase: 'processing' });
    expect(ref.current.currentMode).toBe('processing');
  });
});
