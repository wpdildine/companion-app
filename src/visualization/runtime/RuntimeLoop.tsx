/**
 * Render-loop only: smooth activity and touchInfluence from runtime ref. No React state.
 * Touch field (viz band) drives touchWorld + touchInfluence when touchFieldActive and !reduceMotion.
 * Organism signals (focusBias, touchPresence, focusZone) derived here; scene.organism mutated each frame.
 * Event-driven pulses are handled in render layers; runtime only maintains event identity + timing.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { useVizIsolationGate } from './VizRuntimeIsolationContext';
import * as THREE from 'three';
import {
  logInfo,
  perfTrace,
  getMilestonesBetween,
  getRecentMilestonesBefore,
  getPerfBufferInstanceId,
  getPerfMilestoneBufferDebugState,
  getLastNMilestonesRaw,
} from '../../shared/logging';
import type { VisualizationEngineRef, VisualizationMode } from './runtimeTypes';
import { getPulseColorWithHue } from './getPulseColor';
import { TARGET_ACTIVITY_BY_MODE } from './createDefaultRef';
import {
  getModeTransitionState,
  toCanonicalVisualizationMode,
} from './modeTransition';
import {
  TOUCH_PRESENCE_LAMBDA,
  TOUCH_NDC_LAMBDA,
  BEAM_LEAN_MAX_NDC,
  computeFocusBias,
  getZoneFromNdcX,
} from '../interaction/zoneLayout';
import { createMotionGrammarEngine } from './MotionGrammarEngine';
import { MOTION_GRAMMAR } from '../scene/artDirection/motionGrammar';

const DT_CAP = 0.1;
const APP_STATE_CYCLE_MS = 1300;
const CANONICAL_CYCLE_MS = 2500;
const APP_STATES: VisualizationMode[] = [
  'idle',
  'listening',
  'processing',
  'speaking',
  'touched',
  'released',
];
const CANONICAL_STATES: VisualizationMode[] = [
  'idle',
  'listening',
  'processing',
  'speaking',
];
const DEBUG_MOTION_GRAMMAR =
  false;
const DEBUG_TOUCH_FIELD = false;
// Toggle this to prove consumers are responding to motion, independent of choreography.
const DEBUG_FORCE_MOTION_BY_MODE = false;
const MODE_TRANSITION_MS = 500;

function seeded01(i: number, seed: number): number {
  return Math.abs(Math.sin(i * seed)) % 1;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function toCanonicalMotionMode(mode: string): 'idle' | 'listening' | 'processing' | 'speaking' {
  return toCanonicalVisualizationMode(mode);
}

function applyDevCycleState(v: VisualizationEngineRef, mode: VisualizationMode): void {
  v.currentMode = mode;
  v.displayMode = mode;
  v.targetActivity = TARGET_ACTIVITY_BY_MODE[mode];
  if (mode === 'touched') {
    v.touchActive = true;
    v.touchWorld = [0, 0, 0];
  } else {
    v.touchActive = false;
    v.touchWorld = null;
  }
}

export function RuntimeLoop({ visualizationRef }: { visualizationRef: React.RefObject<VisualizationEngineRef | null> }) {
  const runtimeLoopOn = useVizIsolationGate('runtime_loop');
  const runtimeLoopSkipLoggedRef = useRef(false);
  const runtimeLoopExecLoggedRef = useRef(false);
  const didLog = useRef(false);
  const touchNdcVec = useRef(new THREE.Vector2());
  const raycaster = useRef(new THREE.Raycaster());
  const touchPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const touchHit = useRef(new THREE.Vector3());
  const touchViewVec = useRef(new THREE.Vector3());
  const touchLogAt = useRef(0);
  const touchNdcSmoothed = useRef(new THREE.Vector2(0, 0));
  const modeLogRef = useRef<string>('');
  const motionLogAt = useRef(0);
  const cycleStartAtRef = useRef(0);
  const canonicalStartAtRef = useRef(0);
  const cycleStartIdxRef = useRef(0);
  const canonicalStartIdxRef = useRef(0);
  const cycleLastStepRef = useRef(-1);
  const canonicalLastStepRef = useRef(-1);
  const prevCycleOnRef = useRef(false);
  const prevCanonicalOnRef = useRef(false);
  const baseClusterPositionsRef = useRef<Array<[number, number, number]> | null>(null);
  const lastLoggedTransitionRef = useRef('');
  const lastSettledTransitionRef = useRef('');
  const motionGrammarRef = useRef<ReturnType<typeof createMotionGrammarEngine> | null>(null);
  if (!motionGrammarRef.current) {
    motionGrammarRef.current = createMotionGrammarEngine(MOTION_GRAMMAR);
  }
  const motionGrammar = motionGrammarRef.current;

  // Perf: lifecycle and starvation (guarded, no per-frame spam)
  const lastTickTimeRef = useRef(0);
  const resumeLogRef = useRef(false);
  const STARVATION_THRESHOLDS_MS = [100, 250, 500, 1000];

  useFrame((state, delta) => {
    const v0 = visualizationRef.current;
    const rid = v0?.bisectRequestId;
    const lc = v0?.bisectLifecycle ?? null;
    if (!runtimeLoopOn) {
      if (!runtimeLoopSkipLoggedRef.current) {
        runtimeLoopSkipLoggedRef.current = true;
        perfTrace('Runtime', 'skipped visualization layer', {
          layer: 'runtime_loop',
          requestId: rid,
          lifecycle: lc,
        });
      }
      return;
    }
    runtimeLoopSkipLoggedRef.current = false;
    if (!runtimeLoopExecLoggedRef.current) {
      runtimeLoopExecLoggedRef.current = true;
      perfTrace('Runtime', 'visualization layer executed', {
        layer: 'runtime_loop',
        requestId: rid,
        lifecycle: lc,
      });
    }
    const v = visualizationRef.current;
    if (!v) return;

    const now = Date.now();
    const previousFrameAtMs = lastTickTimeRef.current;
    const timeSinceLastFrameMs = previousFrameAtMs > 0 ? now - previousFrameAtMs : 0;
    if (timeSinceLastFrameMs > 0) {
      const matchedTiers = STARVATION_THRESHOLDS_MS.filter(t => timeSinceLastFrameMs >= t);
      const tierMs = matchedTiers.length > 0 ? Math.max(...matchedTiers) : 0;
      if (tierMs > 0 && typeof __DEV__ !== 'undefined' && __DEV__) {
        const milestonesDuringGap = getMilestonesBetween(previousFrameAtMs, now);
        const recentMilestonesBeforeFrame = getRecentMilestonesBefore(now, 5).map(m => ({
          name: m.name,
          scope: m.scope,
          timestamp: m.timestamp,
          ...(m.requestId != null && { requestId: m.requestId }),
        }));
        logInfo('VisualizationRuntime', '[Perf] viz frame starvation', {
          previousFrameAtMs,
          currentFrameAtMs: now,
          timeSinceLastFrameMs,
          gapMs: timeSinceLastFrameMs,
          tierMs,
          perfBufferInstanceId: getPerfBufferInstanceId(),
          perfBufferDebugState: getPerfMilestoneBufferDebugState(),
          recentMilestonesBeforeFrameCount: recentMilestonesBeforeFrame.length,
          milestonesDuringGapCount: milestonesDuringGap.length,
          lastMilestonesRaw: getLastNMilestonesRaw(5).map(m => ({ name: m.name, timestamp: m.timestamp })),
          milestonesDuringGap: milestonesDuringGap.map(m => ({ name: m.name, scope: m.scope, timestamp: m.timestamp, requestId: m.requestId })),
          noMilestonesDuringGap: milestonesDuringGap.length === 0,
          recentMilestonesBeforeFrame,
          currentMode: v.currentMode,
          displayMode: v.displayMode,
          vizIntensity: v.vizIntensity,
          appState: v.appState,
          lastEvent: v.lastEvent ?? undefined,
          attributionNote:
            'timeSinceLastFrameMs is time since previous frame; milestonesDuringGap lists perf milestones that occurred during the gap',
        });
      }
      if (timeSinceLastFrameMs > 500) {
        const milestonesDuringGap = getMilestonesBetween(previousFrameAtMs, now);
        const recentMilestonesBeforeFrame = getRecentMilestonesBefore(now, 5).map(m => ({
          name: m.name,
          scope: m.scope,
          timestamp: m.timestamp,
          ...(m.requestId != null && { requestId: m.requestId }),
        }));
        perfTrace('VisualizationRuntime', 'first RuntimeLoop tick after long gap', {
          previousFrameAtMs,
          currentFrameAtMs: now,
          timeSinceLastFrameMs,
          gapMs: timeSinceLastFrameMs,
          perfBufferInstanceId: getPerfBufferInstanceId(),
          perfBufferDebugState: getPerfMilestoneBufferDebugState(),
          recentMilestonesBeforeFrameCount: recentMilestonesBeforeFrame.length,
          milestonesDuringGapCount: milestonesDuringGap.length,
          lastMilestonesRaw: getLastNMilestonesRaw(5).map(m => ({ name: m.name, timestamp: m.timestamp })),
          appState: v.appState,
          currentMode: v.currentMode,
          milestonesDuringGap: milestonesDuringGap.map(m => ({ name: m.name, scope: m.scope, timestamp: m.timestamp, requestId: m.requestId })),
          noMilestonesDuringGap: milestonesDuringGap.length === 0,
          recentMilestonesBeforeFrame,
        });
        resumeLogRef.current = true;
      }
    } else {
      perfTrace('VisualizationRuntime', 'first RuntimeLoop tick');
    }
    lastTickTimeRef.current = now;

    didLog.current = true;
    v.clock = state.clock.getElapsedTime();
    if (
      v.debugPulseLoopOn &&
      now - v.debugLastPulseAtMs >= Math.max(120, v.debugPulseIntervalMs)
    ) {
      const i = v.lastPulseIndex % 3;
      v.pulsePositions[i] = [0, 0, 0];
      v.pulseTimes[i] = v.clock;
      v.pulseColors[i] = getPulseColorWithHue(
        v.paletteId,
        v.hueShift,
        'chunkAccepted',
        v.currentMode,
      );
      v.lastPulseIndex = (v.lastPulseIndex + 1) % 3;
      v.debugLastPulseAtMs = now;
    }

    // Dev cycle ownership lives in RuntimeLoop so mode writes and mode reads share the same runtime.
    if (v.canonicalCycleOn && v.stateCycleOn) {
      // Canonical cycle has priority.
      v.stateCycleOn = false;
    }
    if (v.stateCycleOn && !prevCycleOnRef.current) {
      cycleStartAtRef.current = now;
      cycleStartIdxRef.current = v.stateCycleIdx % APP_STATES.length;
      cycleLastStepRef.current = -1;
    }
    if (v.canonicalCycleOn && !prevCanonicalOnRef.current) {
      canonicalStartAtRef.current = now;
      canonicalStartIdxRef.current =
        v.canonicalCycleIdx % CANONICAL_STATES.length;
      canonicalLastStepRef.current = -1;
    }
    if (v.stateCycleOn) {
      const step = Math.floor(
        Math.max(0, now - cycleStartAtRef.current) / APP_STATE_CYCLE_MS,
      );
      if (step !== cycleLastStepRef.current) {
        cycleLastStepRef.current = step;
        v.stateCycleIdx = (cycleStartIdxRef.current + step) % APP_STATES.length;
        const mode = APP_STATES[v.stateCycleIdx]!;
        applyDevCycleState(v, mode);
        if (DEBUG_MOTION_GRAMMAR) {
          console.log('[MotionGrammar] dev state cycle step', {
            kind: 'state',
            step,
            stateCycleIdx: v.stateCycleIdx,
            mode,
          });
        }
      }
    }
    if (v.canonicalCycleOn) {
      const step = Math.floor(
        Math.max(0, now - canonicalStartAtRef.current) / CANONICAL_CYCLE_MS,
      );
      if (step !== canonicalLastStepRef.current) {
        canonicalLastStepRef.current = step;
        v.canonicalCycleIdx =
          (canonicalStartIdxRef.current + step) % CANONICAL_STATES.length;
        const mode = CANONICAL_STATES[v.canonicalCycleIdx]!;
        applyDevCycleState(v, mode);
        if (DEBUG_MOTION_GRAMMAR) {
          console.log('[MotionGrammar] dev state cycle step', {
            kind: 'canonical',
            step,
            canonicalCycleIdx: v.canonicalCycleIdx,
            mode,
          });
        }
      }
    }
    if (!v.stateCycleOn) cycleLastStepRef.current = -1;
    if (!v.canonicalCycleOn) canonicalLastStepRef.current = -1;
    prevCycleOnRef.current = v.stateCycleOn;
    prevCanonicalOnRef.current = v.canonicalCycleOn;
    if (DEBUG_TOUCH_FIELD && v.touchFieldActive && now - touchLogAt.current > 400) {
      touchLogAt.current = now;
      console.log('[Viz] RuntimeLoop touchField', { touchFieldNdc: v.touchFieldNdc, touchWorld: v.touchWorld, touchInfluence: v.touchInfluence.toFixed(3), reduceMotion: v.reduceMotion });
    }
    const dt = Math.min(delta, DT_CAP);
    const dtMs = dt * 1000;
    const canonicalMode = toCanonicalMotionMode(v.currentMode);
    const transitionTarget = toCanonicalVisualizationMode(v.modeTransitionTo);
    if (canonicalMode !== transitionTarget) {
      const transitionWasActive = v.modeTransitionT > 0 && v.modeTransitionT < 1;
      if (transitionWasActive && typeof __DEV__ !== 'undefined' && __DEV__) {
        logInfo('VisualizationRuntime', '[VizTrace] mode transition reset while active', {
          currentMode: v.currentMode,
          incomingCanonical: canonicalMode,
          priorFrom: v.modeTransitionFrom,
          priorTo: v.modeTransitionTo,
          priorT: Number(v.modeTransitionT.toFixed(3)),
        });
      }
      v.modeTransitionFrom = transitionTarget;
      v.modeTransitionTo = canonicalMode;
      v.modeTransitionT = 0;
      v.displayMode = v.currentMode;
      const transitionKey = `${v.modeTransitionFrom}->${v.modeTransitionTo}`;
      if (lastLoggedTransitionRef.current !== transitionKey) {
        lastLoggedTransitionRef.current = transitionKey;
        lastSettledTransitionRef.current = '';
        logInfo('VisualizationRuntime', 'mode transition started', {
          fromMode: v.modeTransitionFrom,
          toMode: v.modeTransitionTo,
          currentMode: v.currentMode,
          displayMode: v.displayMode,
          activity: Number(v.activity.toFixed(3)),
          targetActivity: Number(v.targetActivity.toFixed(3)),
        });
      }
    } else if (v.modeTransitionT < 1) {
      v.modeTransitionT = Math.min(1, v.modeTransitionT + dtMs / MODE_TRANSITION_MS);
      v.displayMode = v.currentMode;
      if (v.modeTransitionT >= 1) {
        v.modeTransitionFrom = canonicalMode;
        v.modeTransitionTo = canonicalMode;
        v.displayMode = v.currentMode;
        const settledKey = `${canonicalMode}@settled`;
        if (lastSettledTransitionRef.current !== settledKey) {
          lastSettledTransitionRef.current = settledKey;
          logInfo('VisualizationRuntime', 'mode transition settled', {
            mode: canonicalMode,
            displayMode: v.displayMode,
            activity: Number(v.activity.toFixed(3)),
            targetActivity: Number(v.targetActivity.toFixed(3)),
          });
          if (canonicalMode === 'speaking') {
            perfTrace('VisualizationRuntime', 'after mode transition settles (speaking)', {
              currentMode: v.currentMode,
              displayMode: v.displayMode,
            });
          }
        }
      }
    } else {
      v.displayMode = v.currentMode;
    }

    const lambda = v.targetActivity > v.activity ? v.lambdaUp : v.lambdaDown;
    const k = 1 - Math.exp(-lambda * dt);
    v.activity = v.activity + (v.targetActivity - v.activity) * k;
    v.activity = Math.max(0, Math.min(1, v.activity));

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
    } else {
      // Critical: relax smoothed NDC back to center when no field input exists.
      // Without this, bend direction can "remember" stale X across mode cycles.
      const kNdcRelax = 1 - Math.exp(-TOUCH_NDC_LAMBDA * dt);
      touchNdcSmoothed.current.x += (0 - touchNdcSmoothed.current.x) * kNdcRelax;
      touchNdcSmoothed.current.y += (0 - touchNdcSmoothed.current.y) * kNdcRelax;
      if (Math.abs(touchNdcSmoothed.current.x) < 1e-4) touchNdcSmoothed.current.x = 0;
      if (Math.abs(touchNdcSmoothed.current.y) < 1e-4) touchNdcSmoothed.current.y = 0;
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

    if (v.scene?.motion) {
      const transition = getModeTransitionState(v);
      if (DEBUG_MOTION_GRAMMAR) {
        const marker = `${v.currentMode}->${canonicalMode}`;
        if (marker !== modeLogRef.current) {
          modeLogRef.current = marker;
          console.log('[MotionGrammar] RuntimeLoop mode input', {
            modeRaw: v.currentMode,
            displayMode: v.displayMode,
            modeCanonical: canonicalMode,
          });
        }
      }
      motionGrammar.tick(dtMs, {
        dtMs,
        mode: v.currentMode,
        transitionFrom: transition.from,
        transitionTo: transition.to,
        transitionT: transition.t,
        touchPresence: v.scene.organism?.presence ?? 0,
        focusBias: v.scene.organism?.focusBias ?? 0,
        activity: v.activity,
        sleepFade: 0,
      }, v.scene.motion);
      if (DEBUG_FORCE_MOTION_BY_MODE) {
        // Diagnostic override: if visuals do not change with this on, consumers are not motion-driven.
        if (canonicalMode === 'processing') {
          v.scene.motion.energy = 1;
          v.scene.motion.openness = 1;
          v.scene.motion.microMotion = 1;
          v.scene.motion.settle = 0;
        } else if (canonicalMode === 'idle') {
          v.scene.motion.energy = 0;
          v.scene.motion.openness = 0;
          v.scene.motion.microMotion = 0;
          v.scene.motion.settle = 1;
        } else if (canonicalMode === 'listening') {
          v.scene.motion.energy = 0.35;
          v.scene.motion.openness = 0.2;
          v.scene.motion.microMotion = 0.25;
          v.scene.motion.settle = 0.25;
        } else {
          v.scene.motion.energy = 0.45;
          v.scene.motion.openness = 0.4;
          v.scene.motion.microMotion = 0.1;
          v.scene.motion.settle = 0.85;
        }
      }
      if (DEBUG_MOTION_GRAMMAR) {
        const nowMs = Date.now();
        if (nowMs - motionLogAt.current > 1000) {
          motionLogAt.current = nowMs;
          console.log('[MotionGrammar] scene.motion snapshot', {
            modeRaw: v.currentMode,
            displayMode: v.displayMode,
            phase: v.scene.motion.phase,
            phaseT: Number(v.scene.motion.phaseT.toFixed(3)),
            energy: Number(v.scene.motion.energy.toFixed(3)),
            tension: Number(v.scene.motion.tension.toFixed(3)),
            openness: Number(v.scene.motion.openness.toFixed(3)),
            settle: Number(v.scene.motion.settle.toFixed(3)),
            attention: Number(v.scene.motion.attention.toFixed(3)),
            microMotion: Number(v.scene.motion.microMotion.toFixed(3)),
            breath: Number(v.scene.motion.breath.toFixed(3)),
            stateCycleOn: v.stateCycleOn,
            canonicalCycleOn: v.canonicalCycleOn,
            modePinActive: v.modePinActive,
            modePin: v.modePin,
            motionAxisDebug: v.motionAxisDebug,
            stateCycleIdx: v.stateCycleIdx,
            canonicalCycleIdx: v.canonicalCycleIdx,
          });
        }
      }

      // Pass C: builder-owned spacing expression.
      // Keep glyph layout derivation in scene data (mutate existing nodes), then renderer consumes it.
      const glyphs = v.scene.contextGlyphs;
      const nodes = v.scene.clusters?.nodes;
      const offsets = glyphs?.zLayerOffsets;
      if (glyphs && nodes && offsets && offsets.length > 0) {
        const openness = v.scene.motion.openness;
        const settle = v.scene.motion.settle;
        const micro = v.scene.motion.microMotion;
        const spacingScale = 1 + openness * 0.42 - settle * 0.12;
        const jitterScale = 1 + micro * 0.35;
        const layerCount = offsets.length;
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i] as {
            id: number;
            clusterId: number;
            zLayer?: number;
            indexInCluster?: number;
            position: [number, number, number];
          };
          const layerSeed = node.zLayer ?? node.indexInCluster ?? 0;
          const layer = ((layerSeed % layerCount) + layerCount) % layerCount;
          const clusterBias =
            node.clusterId === 0 ? glyphs.rulesClusterZBias : glyphs.cardsClusterZBias;
          const baseZ = offsets[layer] + clusterBias;
          const jitterN = seeded01(node.id + layer * 17, 97.113) * 2 - 1;
          node.position[2] =
            baseZ * spacingScale + jitterN * glyphs.zLayerJitter * jitterScale;
        }
      }

      // Pass D: touch-driven repulsion in shared node positions (so glyphs + links stay correlated).
      if (nodes && nodes.length > 0) {
        if (!baseClusterPositionsRef.current || baseClusterPositionsRef.current.length !== nodes.length) {
          baseClusterPositionsRef.current = nodes.map(node => [
            node.position[0],
            node.position[1],
            node.position[2],
          ]);
        }
        const basePositions = baseClusterPositionsRef.current;
        const touchWorld = v.touchWorld;
        const touchInfluence = v.touchInfluence;
        const touchRadius = glyphs?.touchRadius ?? 3.6;
        const touchStrength = glyphs?.touchStrength ?? 2.8;
        const touchMaxOffset = glyphs?.touchMaxOffset ?? 1.35;
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i] as { position: [number, number, number] };
          const base = basePositions[i]!;
          node.position[0] = base[0];
          node.position[1] = base[1];
          if (!touchWorld || touchInfluence <= 0) continue;
          const dx = node.position[0] - touchWorld[0];
          const dy = node.position[1] - touchWorld[1];
          const dist = Math.hypot(dx, dy);
          const radiusMask = 1 - smoothstep(0, touchRadius, dist);
          const repulse = Math.min(
            touchMaxOffset,
            touchInfluence * touchStrength * radiusMask * radiusMask,
          );
          if (dist > 0.0001 && repulse > 0) {
            const inv = 1 / dist;
            node.position[0] += dx * inv * repulse;
            node.position[1] += dy * inv * repulse;
          }
        }
      }
    }

    const rotScale = 0.25 + v.activity * 0.45;
    v.autoRotX += dt * v.autoRotSpeedX * rotScale;
    v.autoRotY += dt * v.autoRotSpeedY * rotScale;
    v.autoRotZ += dt * v.autoRotSpeedZ * rotScale;
  });
  return null;
}
