/**
 * Fine-grained visualization runtime toggles (dev/harness).
 * Default: all subsystems on. Set __ATLAS_VIZ_SUBSYSTEMS__[key] = false to disable.
 * Wave 1: panel state only until layer consumers are wired in later waves.
 */

export type VizSubsystemKey =
  | 'signalApply'
  | 'lifecycleMode'
  | 'spineStep'
  | 'r3fFrame'
  | 'materialUniforms'
  | 'runtimeLoopOrchestration'
  | 'fallbackInterval'
  | 'postFx';

export type VizSubsystemMap = Partial<Record<VizSubsystemKey, boolean>>;

declare global {
  var __ATLAS_VIZ_SUBSYSTEMS__: VizSubsystemMap | undefined;
}

const listeners = new Set<() => void>();

export function subscribeVizSubsystemChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.warn('[VizSubsystem] listener error', e);
    }
  });
}

export function getVizSubsystemEnabled(key: VizSubsystemKey): boolean {
  const g = globalThis as typeof globalThis & {
    __ATLAS_VIZ_SUBSYSTEMS__?: VizSubsystemMap;
  };
  const m = g.__ATLAS_VIZ_SUBSYSTEMS__;
  if (m && m[key] === false) return false;
  return true;
}

export function setVizSubsystem(key: VizSubsystemKey, enabled: boolean): void {
  const g = globalThis as typeof globalThis & {
    __ATLAS_VIZ_SUBSYSTEMS__?: VizSubsystemMap;
  };
  const cur: VizSubsystemMap = { ...(g.__ATLAS_VIZ_SUBSYSTEMS__ ?? {}) };
  if (enabled) {
    delete cur[key];
  } else {
    cur[key] = false;
  }
  g.__ATLAS_VIZ_SUBSYSTEMS__ = Object.keys(cur).length > 0 ? cur : undefined;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const stored = g.__ATLAS_VIZ_SUBSYSTEMS__;
    console.log('[VizSubsystem:set]', key, { ...(stored ?? {}) });
  }
  notify();
}

export function resetVizSubsystems(): void {
  const g = globalThis as typeof globalThis & {
    __ATLAS_VIZ_SUBSYSTEMS__?: VizSubsystemMap;
  };
  g.__ATLAS_VIZ_SUBSYSTEMS__ = undefined;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[VizSubsystem] reset all on');
  }
  notify();
}

/** postFx first: keeps the only currently wired visual toggle above the fold in the debug panel. */
export const VIZ_SUBSYSTEM_KEYS: VizSubsystemKey[] = [
  'postFx',
  'signalApply',
  'lifecycleMode',
  'spineStep',
  'r3fFrame',
  'materialUniforms',
  'runtimeLoopOrchestration',
  'fallbackInterval',
];
