/**
 * Dev/debug: Viz debug panel and `global.__ATLAS_VIZ_RUNTIME_MODE__` override.
 * R3F canvas uses full pipeline by default; this mode is for dev tooling / console experiments.
 */

export type VizRuntimeMode =
  | 'all_on'
  | 'all_off'
  | 'signal_apply_only'
  | 'spine_only'
  | 'r3f_only'
  | 'runtime_loop_only'
  | 'fallback_only';

/** Bundle default when global override is unset (dev panel display + console helpers). */
export const VIZ_RUNTIME_MODE: VizRuntimeMode = 'all_on';

declare global {
  var __ATLAS_VIZ_RUNTIME_MODE__: VizRuntimeMode | undefined;
}

const listeners = new Set<() => void>();

export function subscribeVizRuntimeMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(): void {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.warn('[VizRuntimeMode] listener error', e);
    }
  });
}

export function getVizRuntimeMode(): VizRuntimeMode {
  const g = globalThis as typeof globalThis & {
    __ATLAS_VIZ_RUNTIME_MODE__?: VizRuntimeMode;
  };
  if (g.__ATLAS_VIZ_RUNTIME_MODE__ != null) {
    return g.__ATLAS_VIZ_RUNTIME_MODE__;
  }
  return VIZ_RUNTIME_MODE;
}

export function setVizRuntimeMode(mode: VizRuntimeMode): void {
  const g = globalThis as typeof globalThis & {
    __ATLAS_VIZ_RUNTIME_MODE__?: VizRuntimeMode;
  };
  g.__ATLAS_VIZ_RUNTIME_MODE__ = mode;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[VizRuntimeMode] updated', mode);
  }
  notifyListeners();
}
