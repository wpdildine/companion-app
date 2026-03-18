/**
 * Optional per-subsystem gates for viz runtime isolation.
 * Defaults: all enabled (full fidelity, matches main). Provider may override for dev experiments.
 */

import { createContext, useContext } from 'react';

export type VizRuntimeIsolationGates = {
  spine_step: boolean;
  r3f_frame: boolean;
  runtime_loop: boolean;
};

/** Full-fidelity defaults — no behavioral change until gates are explicitly toggled. */
export const VIZ_RUNTIME_ISOLATION_ALL_ON: VizRuntimeIsolationGates = {
  spine_step: true,
  r3f_frame: true,
  runtime_loop: true,
};

export const VizRuntimeIsolationContext =
  createContext<VizRuntimeIsolationGates>(VIZ_RUNTIME_ISOLATION_ALL_ON);

export function useVizIsolationGate<K extends keyof VizRuntimeIsolationGates>(
  k: K,
): boolean {
  return useContext(VizRuntimeIsolationContext)[k];
}
