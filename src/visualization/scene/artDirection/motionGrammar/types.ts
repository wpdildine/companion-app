/**
 * Motion grammar template types. Configuration only; no runtime logic.
 * Used by MotionGrammarEngine to convert discrete modes into continuous motion signals.
 */

import type { CanonicalSceneMode } from '../../sceneMode';

/** Per-signal scalar set produced by the engine (all ∈ [0,1]). */
export type MotionSignals = {
  energy: number;
  tension: number;
  openness: number;
  settle: number;
  breath: number;
  attention: number;
  microMotion: number;
};

/** Target values per mode (breath is computed by oscillator, not from targets). */
export type MotionTargets = Omit<MotionSignals, 'breath'>;

/** Easing time constants per signal (lambda for exponential smoothing). */
export type MotionEasing = {
  energy: { lambdaUp: number; lambdaDown: number };
  tension: { lambdaUp: number; lambdaDown: number };
  openness: { lambdaUp: number; lambdaDown: number };
  settle: { lambdaUp: number; lambdaDown: number };
  attention: { lambdaUp: number; lambdaDown: number };
  microMotion: { lambdaUp: number; lambdaDown: number };
};

/** Breath oscillator config per mode. */
export type MotionBreath = {
  ampByMode: Record<CanonicalSceneMode, number>;
  hzByMode: Record<CanonicalSceneMode, number>;
  shape: 'sin' | 'smoothstep';
  biasByMode?: Record<CanonicalSceneMode, number>;
};

/** Touch coupling: small nudge to signals from Phase 3 organism. */
export type MotionTouchCoupling = {
  energyBoost: number;
  tensionBoost: number;
  opennessBias: number;
  focusCoupling: number;
};

/** Sleep: multiplier applied to all outputs when sleepFade > 0. */
export type MotionSleepCoupling = {
  multiplier: number;
};

/** Per-mode transition envelope (enter: attack/hold/release, overshoot). */
export type MotionBeatEnvelope = {
  attackMs: number;
  holdMs: number;
  releaseMs: number;
  overshoot: number;
};

export type MotionBeats = {
  [K in CanonicalSceneMode]?: {
    enter?: MotionBeatEnvelope;
    exit?: MotionBeatEnvelope;
  };
};

/** Full motion grammar template. */
export type MotionGrammarTemplate = {
  targetsByMode: Record<CanonicalSceneMode, MotionTargets>;
  easing: MotionEasing;
  breath: MotionBreath;
  touchCoupling: MotionTouchCoupling;
  sleepCoupling: MotionSleepCoupling;
  beats: MotionBeats;
};
