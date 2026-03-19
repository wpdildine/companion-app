/**
 * Fine-grained visualization runtime toggles (dev only).
 * Default: all subsystems on. Set __ATLAS_VIZ_SUBSYSTEMS__[key] = false to disable.
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
  notify();
}

export function resetVizSubsystems(): void {
  const g = globalThis as typeof globalThis & {
    __ATLAS_VIZ_SUBSYSTEMS__?: VizSubsystemMap;
  };
  g.__ATLAS_VIZ_SUBSYSTEMS__ = undefined;
  notify();
}

const ALL_SUBSYSTEM_KEYS: VizSubsystemKey[] = [
  'signalApply',
  'lifecycleMode',
  'runtimeLoopOrchestration',
  'spineStep',
  'r3fFrame',
  'materialUniforms',
  'postFx',
  'fallbackInterval',
];

/** Preset: every subsystem enabled (clears map). */
export function presetAllVizSubsystemsOn(): void {
  resetVizSubsystems();
}

/** Preset: every subsystem disabled. */
export function presetAllVizSubsystemsOff(): void {
  const g = globalThis as typeof globalThis & {
    __ATLAS_VIZ_SUBSYSTEMS__?: VizSubsystemMap;
  };
  const cur: VizSubsystemMap = {};
  for (const k of ALL_SUBSYSTEM_KEYS) {
    cur[k] = false;
  }
  g.__ATLAS_VIZ_SUBSYSTEMS__ = cur;
  notify();
}

export const VIZ_SUBSYSTEM_KEYS: VizSubsystemKey[] = [...ALL_SUBSYSTEM_KEYS];
