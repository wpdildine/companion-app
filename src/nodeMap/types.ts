/**
 * Node map viz: engine state ref shape and mode type.
 * Plan: discrete mode in React; continuous animation in render loop via this ref.
 */

export type VizMode =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'touched'
  | 'released';

export interface TouchNdc {
  x: number;
  y: number;
}

export interface VizEngineRef {
  clock: number;
  activity: number;
  targetActivity: number;
  voiceEnergy: number;
  bands: Float32Array;
  pulsePositions: [number, number, number][];
  pulseTimes: [number, number, number];
  pulseColors: [number, number, number][];
  lastPulseIndex: number;
  activityLambda: number;
  lambdaUp: number;
  lambdaDown: number;
  paletteId: number;
  hueShift: number;
  satBoost: number;
  lumBoost: number;
  showViz: boolean;
  showConnections: boolean;
  starCountMultiplier: number;
  touchActive: boolean;
  touchNdc: TouchNdc;
  touchWorld: [number, number, number] | null;
  touchInfluence: number;
}

const SENTINEL_FAR = 1e6;

export function createDefaultVizRef(): VizEngineRef {
  return {
    clock: 0,
    activity: 0,
    targetActivity: 0.1,
    voiceEnergy: 0,
    bands: new Float32Array(32),
    pulsePositions: [[SENTINEL_FAR, SENTINEL_FAR, SENTINEL_FAR], [SENTINEL_FAR, SENTINEL_FAR, SENTINEL_FAR], [SENTINEL_FAR, SENTINEL_FAR, SENTINEL_FAR]],
    pulseTimes: [-1e3, -1e3, -1e3],
    pulseColors: [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
    lastPulseIndex: 0,
    activityLambda: 6,
    lambdaUp: 8,
    lambdaDown: 4,
    paletteId: 0,
    hueShift: 0,
    satBoost: 1,
    lumBoost: 1,
    showViz: true,
    showConnections: true,
    starCountMultiplier: 1,
    touchActive: false,
    touchNdc: { x: 0, y: 0 },
    touchWorld: null,
    touchInfluence: 0,
  };
}

/** targetActivity by mode (plan §1) */
export const TARGET_ACTIVITY_BY_MODE: Record<VizMode, number> = {
  idle: 0.1,
  listening: 0.6,
  processing: 1.0,
  speaking: 0.7,
  touched: 0.5,
  released: 0.6, // brief then listening
};
