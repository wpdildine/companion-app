/**
 * Render-loop only: smooth activity and touchInfluence from engine ref. No React state.
 */

import { useFrame } from '@react-three/fiber';
import type { VizEngineRef } from './types';

const DT_CAP = 0.1;

export function EngineLoop({ vizRef }: { vizRef: React.RefObject<VizEngineRef | null> }) {
  useFrame((state, delta) => {
    const v = vizRef.current;
    if (!v) return;
    v.clock = state.clock.getElapsedTime();
    const dt = Math.min(delta, DT_CAP);
    const lambda = v.targetActivity > v.activity ? v.lambdaUp : v.lambdaDown;
    const k = 1 - Math.exp(-lambda * dt);
    v.activity = v.activity + (v.targetActivity - v.activity) * k;
    v.activity = Math.max(0, Math.min(1, v.activity));
    const touchTarget = v.touchActive ? 1 : 0;
    const tk = 1 - Math.exp(-6 * dt);
    v.touchInfluence = v.touchInfluence + (touchTarget - v.touchInfluence) * tk;
  });
  return null;
}
