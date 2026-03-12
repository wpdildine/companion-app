/**
 * MotionGrammarEngine: converts discrete visualization modes into continuous motion signals.
 * Consumes a motion grammar template; mutates scene.motion each frame. No per-frame allocations.
 */

import type { CanonicalSceneMode } from '../scene/sceneMode';
import type { GLSceneMotion, GLSceneMotionPhase } from '../scene/sceneFormations';
import type { MotionGrammarTemplate, MotionSignals, MotionTargets } from '../scene/artDirection/motionGrammar/types';
import type { VisualizationMode } from './runtimeTypes';
import type { CanonicalVisualizationMode } from './modeTransition';

const DEBUG_MOTION_GRAMMAR =
  false;

export type MotionGrammarInputs = {
  mode: VisualizationMode;
  transitionFrom?: CanonicalVisualizationMode;
  transitionTo?: CanonicalVisualizationMode;
  transitionT?: number;
  dtMs: number;
  touchPresence: number;
  focusBias: number;
  activity: number;
  sleepFade: number;
};

function toCanonicalMode(mode: VisualizationMode): CanonicalSceneMode {
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

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function getBeatGain(phaseElapsedMs: number, attackMs: number, holdMs: number, releaseMs: number, overshoot: number): number {
  const a = Math.max(0, attackMs);
  const h = Math.max(0, holdMs);
  const r = Math.max(0, releaseMs);
  const over = Math.max(0, overshoot);

  if (a > 0 && phaseElapsedMs < a) {
    const t = phaseElapsedMs / a;
    return 1 + over * smoothstep01(t);
  }
  if (h > 0 && phaseElapsedMs < a + h) {
    return 1 + over;
  }
  if (r > 0 && phaseElapsedMs < a + h + r) {
    const t = (phaseElapsedMs - a - h) / r;
    return 1 + over * (1 - smoothstep01(t));
  }
  return 1;
}

/** Writes desired scalars for this frame from mode targets + beat envelope into out (no allocations). */
function writeDesiredFromEnvelope(
  out: MotionTargets,
  targets: MotionTargets,
  phase: GLSceneMotionPhase,
  phaseElapsedMs: number,
  attackMs: number,
  holdMs: number,
  releaseMs: number,
  overshoot: number,
): void {
  const gain =
    phase === 'enter'
      ? getBeatGain(phaseElapsedMs, attackMs, holdMs, releaseMs, overshoot)
      : 1;
  out.energy = targets.energy * gain;
  out.tension = targets.tension * gain;
  out.openness = targets.openness * gain;
  out.settle = targets.settle * gain;
  out.attention = targets.attention * gain;
  out.microMotion = targets.microMotion * gain;
}

function createSignals(): MotionSignals {
  return {
    energy: 0,
    tension: 0,
    openness: 0,
    settle: 0,
    breath: 0,
    attention: 0,
    microMotion: 0,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function writeBlendedTargets(
  out: MotionTargets,
  from: MotionTargets,
  to: MotionTargets,
  t: number,
): void {
  out.energy = lerp(from.energy, to.energy, t);
  out.tension = lerp(from.tension, to.tension, t);
  out.openness = lerp(from.openness, to.openness, t);
  out.settle = lerp(from.settle, to.settle, t);
  out.attention = lerp(from.attention, to.attention, t);
  out.microMotion = lerp(from.microMotion, to.microMotion, t);
}

export function createMotionGrammarEngine(template: MotionGrammarTemplate): {
  tick: (dtMs: number, inputs: MotionGrammarInputs, motionOut: GLSceneMotion) => void;
} {
  let currentMode: CanonicalSceneMode = 'idle';
  let nextMode: CanonicalSceneMode = 'idle';
  let phase: GLSceneMotionPhase = 'hold';
  let phaseElapsedMs = 0;
  const signalsCurrent = createSignals();
  const signalsDesired: MotionTargets = {
    energy: 0,
    tension: 0,
    openness: 0,
    settle: 0,
    attention: 0,
    microMotion: 0,
  };
  let breathPhase = 0;

  function tick(dtMs: number, inputs: MotionGrammarInputs, motionOut: GLSceneMotion): void {
    const dtSec = Math.min(dtMs / 1000, 0.1);
    const canonical = toCanonicalMode(inputs.mode);
    const transitionFrom = inputs.transitionFrom ?? canonical;
    const transitionTo = inputs.transitionTo ?? canonical;
    const transitionT = clamp01(inputs.transitionT ?? 1);
    const transitionActive = transitionFrom !== transitionTo && transitionT < 1;

    if (!transitionActive && canonical !== currentMode && canonical !== nextMode) {
      if (DEBUG_MOTION_GRAMMAR) {
        console.log('[MotionGrammar] mode change detected', {
          from: currentMode,
          to: canonical,
          phaseFrom: phase,
        });
      }
      nextMode = canonical;
      phase = 'enter';
      phaseElapsedMs = 0;
    }

    phaseElapsedMs += dtMs;
    const enterBeats = template.beats[nextMode]?.enter;
    const attackMs = enterBeats?.attackMs ?? 220;
    const holdMs = enterBeats?.holdMs ?? 90;
    const releaseMs = enterBeats?.releaseMs ?? 160;
    const overshoot = enterBeats?.overshoot ?? 0;
    const enterTotalMs = Math.max(1, attackMs + holdMs + releaseMs);
    if (!transitionActive && phase === 'enter' && phaseElapsedMs >= enterTotalMs) {
      phase = 'hold';
      currentMode = nextMode;
      phaseElapsedMs = 0;
      if (DEBUG_MOTION_GRAMMAR) {
        console.log('[MotionGrammar] phase transition', {
          mode: currentMode,
          phase,
        });
      }
    }
    if (transitionActive) {
      writeBlendedTargets(
        signalsDesired,
        template.targetsByMode[transitionFrom],
        template.targetsByMode[transitionTo],
        transitionT,
      );
    } else {
      const modeTargets = template.targetsByMode[nextMode];
      writeDesiredFromEnvelope(
        signalsDesired,
        modeTargets,
        phase,
        phaseElapsedMs,
        attackMs,
        holdMs,
        releaseMs,
        overshoot,
      );
    }

    const ease = (current: number, desired: number, key: keyof MotionTargets): number => {
      const e = template.easing[key];
      const lambda = desired > current ? e.lambdaUp : e.lambdaDown;
      const k = 1 - Math.exp(-lambda * dtSec);
      return current + (desired - current) * k;
    };

    signalsCurrent.energy = ease(signalsCurrent.energy, signalsDesired.energy, 'energy');
    signalsCurrent.tension = ease(signalsCurrent.tension, signalsDesired.tension, 'tension');
    signalsCurrent.openness = ease(signalsCurrent.openness, signalsDesired.openness, 'openness');
    signalsCurrent.settle = ease(signalsCurrent.settle, signalsDesired.settle, 'settle');
    signalsCurrent.attention = ease(signalsCurrent.attention, signalsDesired.attention, 'attention');
    signalsCurrent.microMotion = ease(signalsCurrent.microMotion, signalsDesired.microMotion, 'microMotion');

    const breath = template.breath;
    const amp = transitionActive
      ? lerp(breath.ampByMode[transitionFrom], breath.ampByMode[transitionTo], transitionT)
      : breath.ampByMode[nextMode];
    const hz = transitionActive
      ? lerp(breath.hzByMode[transitionFrom], breath.hzByMode[transitionTo], transitionT)
      : breath.hzByMode[nextMode];
    const fromBias = breath.biasByMode?.[transitionFrom] ?? 0.5;
    const toBias = breath.biasByMode?.[transitionTo] ?? 0.5;
    const breathBias = transitionActive
      ? lerp(fromBias, toBias, transitionT)
      : breath.biasByMode?.[nextMode] ?? 0.5;
    breathPhase += (dtMs / 1000) * hz * 2 * Math.PI;
    const t = breathPhase % (2 * Math.PI);
    let wave = 0.5 + 0.5 * Math.sin(t);
    if (breath.shape === 'smoothstep') {
      wave = smoothstep01(wave);
    }
    signalsCurrent.breath = clamp01(breathBias + (wave - 0.5) * amp);

    const tc = template.touchCoupling;
    const p = inputs.touchPresence;
    const f = inputs.focusBias;
    signalsCurrent.energy = clamp01(signalsCurrent.energy + p * tc.energyBoost);
    signalsCurrent.tension = clamp01(signalsCurrent.tension + p * tc.tensionBoost);
    signalsCurrent.openness = clamp01(signalsCurrent.openness + p * f * tc.opennessBias);
    signalsCurrent.attention = clamp01(signalsCurrent.attention + Math.abs(f) * p * tc.focusCoupling);

    let sleepMult = 1;
    if (inputs.sleepFade > 0) {
      sleepMult = 1 - inputs.sleepFade * (1 - template.sleepCoupling.multiplier);
    }
    motionOut.energy = clamp01(signalsCurrent.energy * sleepMult);
    motionOut.tension = clamp01(signalsCurrent.tension * sleepMult);
    motionOut.openness = clamp01(signalsCurrent.openness * sleepMult);
    motionOut.settle = clamp01(signalsCurrent.settle * sleepMult);
    motionOut.breath = clamp01(signalsCurrent.breath * sleepMult);
    motionOut.attention = clamp01(signalsCurrent.attention * sleepMult);
    motionOut.microMotion = clamp01(signalsCurrent.microMotion * sleepMult);
    motionOut.phase = transitionActive ? 'enter' : phase;
    motionOut.phaseT =
      transitionActive
        ? transitionT
        : phase === 'enter'
        ? Math.min(1, phaseElapsedMs / enterTotalMs)
        : 1;
  }

  return { tick };
}
