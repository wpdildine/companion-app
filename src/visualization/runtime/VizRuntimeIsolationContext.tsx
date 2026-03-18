/**
 * Optional per-subsystem gates for viz runtime isolation.
 * Defaults: all enabled (full fidelity, matches main). Provider may override for dev experiments.
 */

import { createContext, useContext } from 'react';
import { getVizRuntimeMode, type VizRuntimeMode } from '../../app/ui/components/overlays/VisualizationRuntimeMode';

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

export function getVizIsolationGatesForMode(
  mode: VizRuntimeMode = getVizRuntimeMode(),
): VizRuntimeIsolationGates {
  switch (mode) {
    case 'all_off':
      return {
        spine_step: false,
        r3f_frame: false,
        runtime_loop: false,
      };
    case 'signal_apply_only':
      return {
        spine_step: false,
        r3f_frame: false,
        runtime_loop: false,
      };
    case 'spine_only':
      return {
        spine_step: true,
        r3f_frame: false,
        runtime_loop: false,
      };
    case 'r3f_only':
      return {
        spine_step: false,
        r3f_frame: true,
        runtime_loop: false,
      };
    case 'runtime_loop_only':
      return {
        spine_step: false,
        r3f_frame: false,
        runtime_loop: true,
      };
    case 'fallback_only':
      return {
        spine_step: false,
        r3f_frame: false,
        runtime_loop: false,
      };
    case 'all_on':
    default:
      return VIZ_RUNTIME_ISOLATION_ALL_ON;
  }
}

export function useVizIsolationGate<K extends keyof VizRuntimeIsolationGates>(
  k: K,
): boolean {
  return useContext(VizRuntimeIsolationContext)[k];
}
