/**
 * Render-loop only: smooth activity and touchInfluence from engine ref. No React state.
 * Touch field (viz band) drives touchWorld + touchInfluence when touchFieldActive and !reduceMotion.
 * Organism signals (focusBias, touchPresence, focusZone) derived here; scene.organism mutated each frame.
 * Event-driven pulses: lastEvent tapCitation → pulse at rules cluster center; tapCard → cards cluster center.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import type { VisualizationEngineRef } from './types';
import { getPulseColorWithHue } from './getPulseColor';
import {
  TOUCH_PRESENCE_LAMBDA,
  TOUCH_NDC_LAMBDA,
  BEAM_LEAN_MAX_NDC,
  computeFocusBias,
  getZoneFromNdcX,
} from '../interaction/zoneLayout';

const DT_CAP = 0.1;
const PULSE_DECAY_MS = 900;

export function EngineLoop({ visualizationRef }: { visualizationRef: React.RefObject<VisualizationEngineRef | null> }) {
  const didLog = useRef(false);
  const touchNdcVec = useRef(new THREE.Vector2());
  const raycaster = useRef(new THREE.Raycaster());
  const touchPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const touchHit = useRef(new THREE.Vector3());
  const touchViewVec = useRef(new THREE.Vector3());
  const lastProcessedEventTime = useRef(0);
  const touchLogAt = useRef(0);
  const touchNdcSmoothed = useRef(new THREE.Vector2(0, 0));

  useFrame((state, delta) => {
    const v = visualizationRef.current;
    if (!v) return;
    didLog.current = true;
    v.clock = state.clock.getElapsedTime();
    const now = Date.now();
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
      if (age < PULSE_DECAY_MS && v.scene?.pulseAnchors) {
        const anchors = v.scene.pulseAnchors;
        const i = v.lastPulseIndex % 3;
        if (v.lastEvent === 'tapCitation') {
          v.pulsePositions[i] = [...anchors.rules];
          v.pulseColors[i] = getPulseColorWithHue(v.paletteId, v.hueShift, 'tapCitation', v.currentMode);
          v.pulseTimes[i] = v.lastEventTime;
          v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
        } else if (v.lastEvent === 'tapCard') {
          v.pulsePositions[i] = [...anchors.cards];
          v.pulseColors[i] = getPulseColorWithHue(v.paletteId, v.hueShift, 'tapCard', v.currentMode);
          v.pulseTimes[i] = v.lastEventTime;
          v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
        } else if (v.lastEvent === 'chunkAccepted') {
          v.pulsePositions[i] = [...anchors.rules];
          v.pulseColors[i] = getPulseColorWithHue(v.paletteId, v.hueShift, 'chunkAccepted', v.currentMode);
          v.pulseTimes[i] = v.lastEventTime;
          v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
        } else if (v.lastEvent === 'warning') {
          v.pulsePositions[i] = [...anchors.center];
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

    // Organism signals: smooth presence and NDC, then compute focusBias and focusZone.
    const presenceTarget = v.reduceMotion ? 0 : touchTarget;
    const kPresence = 1 - Math.exp(-TOUCH_PRESENCE_LAMBDA * dt);
    v.touchPresence = v.touchPresence + (presenceTarget - v.touchPresence) * kPresence;
    if (v.touchFieldActive && v.touchFieldNdc && !v.reduceMotion) {
      const kNdc = 1 - Math.exp(-TOUCH_NDC_LAMBDA * dt);
      touchNdcSmoothed.current.x += (v.touchFieldNdc[0] - touchNdcSmoothed.current.x) * kNdc;
      touchNdcSmoothed.current.y += (v.touchFieldNdc[1] - touchNdcSmoothed.current.y) * kNdc;
    }
    v.touchPresenceNdc.x = touchNdcSmoothed.current.x;
    v.touchPresenceNdc.y = touchNdcSmoothed.current.y;
    const beamCenterNdcX = v.focusBias * BEAM_LEAN_MAX_NDC;
    v.focusBias = computeFocusBias(
      touchNdcSmoothed.current.x,
      v.touchPresence,
      beamCenterNdcX,
    );
    const zoneFromNdc =
      v.touchPresence > 0 ? getZoneFromNdcX(touchNdcSmoothed.current.x) : null;
    v.focusZone = v.touchPresence > 0 ? (zoneFromNdc ?? 'neutral') : null;

    if (v.scene?.organism) {
      const o = v.scene.organism;
      o.presence = v.touchPresence;
      o.focusBias = v.focusBias;
      o.ndc.x = v.touchPresenceNdc.x;
      o.ndc.y = v.touchPresenceNdc.y;
      o.zone = v.focusZone;
      o.relax = 1 - v.touchPresence;
      o.shardBias = v.focusBias * v.touchPresence;
    }

    const rotScale = 0.25 + v.activity * 0.45;
    v.autoRotX += dt * v.autoRotSpeedX * rotScale;
    v.autoRotY += dt * v.autoRotSpeedY * rotScale;
    v.autoRotZ += dt * v.autoRotSpeedZ * rotScale;
  });
  return null;
}
