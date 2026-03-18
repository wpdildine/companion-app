/**
 * Optional per-subsystem gates for viz runtime isolation (defaults: all enabled).
 * TouchRaycaster / CameraSync are not gated here (input + projection shell).
 */

import { createContext, useContext } from 'react';

export type VizRuntimeIsolationGates = {
  spine_step: boolean;
  r3f_frame: boolean;
  runtime_loop: boolean;
};

const defaultGates: VizRuntimeIsolationGates = {
  spine_step: false,
  r3f_frame: false,
  runtime_loop: false,
};

export const VizRuntimeIsolationContext =
  createContext<VizRuntimeIsolationGates>(defaultGates);

export function useVizIsolationGate<K extends keyof VizRuntimeIsolationGates>(
  k: K,
): boolean {
  return useContext(VizRuntimeIsolationContext)[k];
}
