import {
  getVizSubsystemEnabled,
  presetAllVizSubsystemsOff,
  presetAllVizSubsystemsOn,
} from './vizSubsystemToggles';

describe('vizSubsystemToggles presets', () => {
  beforeEach(() => {
    presetAllVizSubsystemsOn();
  });

  it('presetAllVizSubsystemsOff disables every known subsystem key', () => {
    presetAllVizSubsystemsOff();
    const keys = [
      'signalApply',
      'lifecycleMode',
      'runtimeLoopOrchestration',
      'spineStep',
      'r3fFrame',
      'materialUniforms',
      'postFx',
      'fallbackInterval',
    ] as const;
    for (const k of keys) {
      expect(getVizSubsystemEnabled(k)).toBe(false);
    }
  });

  it('presetAllVizSubsystemsOn clears map so all are enabled', () => {
    presetAllVizSubsystemsOff();
    presetAllVizSubsystemsOn();
    expect(getVizSubsystemEnabled('postFx')).toBe(true);
    expect(getVizSubsystemEnabled('signalApply')).toBe(true);
  });
});
