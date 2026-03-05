/**
 * Organism motion grammar: "alive organism" behavior.
 * Targets and beats tuned for idle → listening → processing → speaking.
 * Configuration only; consumed by MotionGrammarEngine.
 */

import type { CanonicalSceneMode } from '../../canonicalMode';
import type { MotionGrammarTemplate, MotionTargets, MotionEasing, MotionBreath, MotionTouchCoupling, MotionSleepCoupling, MotionBeats } from './types';

function defaultTargets(overrides: Partial<MotionTargets> = {}): MotionTargets {
  return {
    energy: 0.2,
    tension: 0.2,
    openness: 0.3,
    settle: 0.5,
    attention: 0.2,
    microMotion: 0.15,
    ...overrides,
  };
}

const defaultEasing: MotionEasing = {
  energy: { lambdaUp: 4, lambdaDown: 2 },
  tension: { lambdaUp: 5, lambdaDown: 2 },
  openness: { lambdaUp: 3, lambdaDown: 2 },
  settle: { lambdaUp: 4, lambdaDown: 2 },
  attention: { lambdaUp: 5, lambdaDown: 2 },
  microMotion: { lambdaUp: 4, lambdaDown: 3 },
};

const defaultBreath: MotionBreath = {
  ampByMode: { idle: 0.5, listening: 0.4, processing: 0.35, speaking: 0.45 },
  hzByMode: { idle: 0.08, listening: 0.12, processing: 0.15, speaking: 0.1 },
  shape: 'sin',
  biasByMode: { idle: 0.5, listening: 0.52, processing: 0.5, speaking: 0.48 },
};

const defaultTouchCoupling: MotionTouchCoupling = {
  energyBoost: 0.08,
  tensionBoost: 0.06,
  opennessBias: 0.04,
  focusCoupling: 0.05,
};

const defaultSleepCoupling: MotionSleepCoupling = {
  multiplier: 0.5,
};

const beats: MotionBeats = {
  idle: {
    enter: { attackMs: 260, holdMs: 120, releaseMs: 320, overshoot: 0.04 },
    exit: { attackMs: 220, holdMs: 80, releaseMs: 280, overshoot: 0.02 },
  },
  listening: {
    enter: { attackMs: 170, holdMs: 120, releaseMs: 210, overshoot: 0.08 },
    exit: { attackMs: 160, holdMs: 70, releaseMs: 180, overshoot: 0.04 },
  },
  processing: {
    enter: { attackMs: 150, holdMs: 140, releaseMs: 220, overshoot: 0.14 },
    exit: { attackMs: 170, holdMs: 100, releaseMs: 240, overshoot: 0.08 },
  },
  speaking: {
    enter: { attackMs: 130, holdMs: 110, releaseMs: 170, overshoot: 0.06 },
    exit: { attackMs: 200, holdMs: 120, releaseMs: 320, overshoot: 0.03 },
  },
};

const targetsByMode: Record<CanonicalSceneMode, MotionTargets> = {
  idle: defaultTargets({ energy: 0.15, tension: 0.1, openness: 0.25, settle: 0.6, attention: 0.1, microMotion: 0.1 }),
  listening: defaultTargets({ energy: 0.35, tension: 0.4, openness: 0.25, settle: 0.3, attention: 0.7, microMotion: 0.2 }),
  processing: defaultTargets({ energy: 0.8, tension: 0.3, openness: 0.75, settle: 0.2, attention: 0.4, microMotion: 0.4 }),
  speaking: defaultTargets({ energy: 0.4, tension: 0.2, openness: 0.4, settle: 0.85, attention: 0.3, microMotion: 0.1 }),
};

export const ORGANISM_GRAMMAR: MotionGrammarTemplate = {
  targetsByMode,
  easing: defaultEasing,
  breath: defaultBreath,
  touchCoupling: defaultTouchCoupling,
  sleepCoupling: defaultSleepCoupling,
  beats,
};
