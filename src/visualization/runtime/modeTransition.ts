import type { VisualizationEngineRef, VisualizationMode } from './runtimeTypes';

export type CanonicalVisualizationMode =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking';

export function toCanonicalVisualizationMode(
  mode: VisualizationMode | string | null | undefined,
): CanonicalVisualizationMode {
  switch (mode) {
    case 'idle':
    case 'listening':
    case 'processing':
    case 'speaking':
      return mode;
    case 'touched':
      return 'listening';
    case 'released':
      return 'speaking';
    default:
      return 'idle';
  }
}

export function getModeTransitionState(v: VisualizationEngineRef): {
  from: CanonicalVisualizationMode;
  to: CanonicalVisualizationMode;
  t: number;
} {
  return {
    from: toCanonicalVisualizationMode(v.modeTransitionFrom),
    to: toCanonicalVisualizationMode(v.modeTransitionTo),
    t: Math.max(0, Math.min(1, Number.isFinite(v.modeTransitionT) ? v.modeTransitionT : 1)),
  };
}

export function easeModeTransition(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function interpolateModeValue(
  v: VisualizationEngineRef,
  values: Record<CanonicalVisualizationMode, number>,
): number {
  const transition = getModeTransitionState(v);
  const eased = easeModeTransition(transition.t);
  const fromValue = values[transition.from];
  const toValue = values[transition.to];
  return fromValue + (toValue - fromValue) * eased;
}
