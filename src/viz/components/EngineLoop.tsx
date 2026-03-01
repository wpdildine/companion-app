/**
 * Render-loop only: smooth activity and touchInfluence from engine ref. No React state.
 * Touch field (viz band) drives touchWorld + touchInfluence when touchFieldActive and !reduceMotion.
 * Event-driven pulses: lastEvent tapCitation → pulse at rules cluster center; tapCard → cards cluster center.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VizEngineRef } from '../types';
import { getTwoClusterCenters } from '../helpers/formations';
import { getPulseColorWithHue } from '../helpers/getPulseColor';

const DT_CAP = 0.1;
const PULSE_DECAY_MS = 900;

export function EngineLoop({ vizRef }: { vizRef: React.RefObject<VizEngineRef | null> }) {
  const didLog = useRef(false);
  const touchNdcVec = useRef(new THREE.Vector2());
  const raycaster = useRef(new THREE.Raycaster());
  const touchPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const touchHit = useRef(new THREE.Vector3());
  const touchViewVec = useRef(new THREE.Vector3());
  const lastProcessedEventTime = useRef(0);
  const clusterCenters = useRef(getTwoClusterCenters());
  const touchLogAt = useRef(0);

  useFrame((state, delta) => {
    const v = vizRef.current;
    if (!v) return;
    didLog.current = true;
    v.clock = state.clock.getElapsedTime();
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (v.touchFieldActive && now - touchLogAt.current > 400) {
      touchLogAt.current = now;
      console.log('[Viz] EngineLoop touchField', { touchFieldNdc: v.touchFieldNdc, touchWorld: v.touchWorld, touchInfluence: v.touchInfluence.toFixed(3), reduceMotion: v.reduceMotion });
    }
    const dt = Math.min(delta, DT_CAP);
    const lambda = v.targetActivity > v.activity ? v.lambdaUp : v.lambdaDown;
    const k = 1 - Math.exp(-lambda * dt);
    v.activity = v.activity + (v.targetActivity - v.activity) * k;
    v.activity = Math.max(0, Math.min(1, v.activity));

    if (v.lastEvent && v.lastEventTime > lastProcessedEventTime.current) {
      lastProcessedEventTime.current = v.lastEventTime;
      const age = (v.clock - v.lastEventTime) * 1000;
      if (age < PULSE_DECAY_MS) {
        const centers = clusterCenters.current;
        const i = v.lastPulseIndex % 3;
        if (v.lastEvent === 'tapCitation') {
          v.pulsePositions[i] = [...centers.rulesCenter];
          v.pulseColors[i] = getPulseColorWithHue(v.paletteId, v.hueShift, 'tapCitation', v.currentMode);
          v.pulseTimes[i] = v.lastEventTime;
          v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
        } else if (v.lastEvent === 'tapCard') {
          v.pulsePositions[i] = [...centers.cardsCenter];
          v.pulseColors[i] = getPulseColorWithHue(v.paletteId, v.hueShift, 'tapCard', v.currentMode);
          v.pulseTimes[i] = v.lastEventTime;
          v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
        } else if (v.lastEvent === 'chunkAccepted') {
          v.pulsePositions[i] = [...centers.rulesCenter];
          v.pulseColors[i] = getPulseColorWithHue(v.paletteId, v.hueShift, 'chunkAccepted', v.currentMode);
          v.pulseTimes[i] = v.lastEventTime;
          v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
        } else if (v.lastEvent === 'warning') {
          v.pulsePositions[i] = [0, 0, 0];
          v.pulseColors[i] = getPulseColorWithHue(v.paletteId, v.hueShift, 'warning', v.currentMode);
          v.pulseTimes[i] = v.lastEventTime;
          v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
        }
      }
    }

    let touchTarget = 0;
    if (v.touchFieldActive && v.touchFieldNdc && !v.reduceMotion) {
      touchNdcVec.current.set(v.touchFieldNdc[0], v.touchFieldNdc[1]);
      raycaster.current.setFromCamera(touchNdcVec.current, state.camera);
      // Use a camera-facing plane through scene origin, matching tap raycast semantics.
      touchPlane.current.normal.copy(state.camera.position).normalize();
      touchPlane.current.constant = 0;
      const hit = raycaster.current.ray.intersectPlane(touchPlane.current, touchHit.current);
      if (hit) {
        v.touchWorld = [touchHit.current.x, touchHit.current.y, touchHit.current.z];
        touchViewVec.current.copy(touchHit.current).applyMatrix4(state.camera.matrixWorldInverse);
        v.touchView = [touchViewVec.current.x, touchViewVec.current.y, touchViewVec.current.z];
      } else {
        v.touchWorld = null;
        v.touchView = null;
      }
      touchTarget = v.touchFieldStrength;
    } else if (v.touchActive) {
      touchTarget = 1;
    } else if (!v.touchFieldActive && !v.touchActive) {
      v.touchWorld = null;
      v.touchView = null;
    }
    const tk = 1 - Math.exp(-6 * dt);
    v.touchInfluence = v.touchInfluence + (touchTarget - v.touchInfluence) * tk;
    const rotScale = 0.25 + v.activity * 0.45;
    v.autoRotX += dt * v.autoRotSpeedX * rotScale;
    v.autoRotY += dt * v.autoRotSpeedY * rotScale;
    v.autoRotZ += dt * v.autoRotSpeedZ * rotScale;
  });
  return null;
}
