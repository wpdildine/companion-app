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
  /** Tap-to-pulse: NDC [x,y] when user taps canvas; cleared after raycast. */
  pendingTapNdc: [number, number] | null;
  /** Canvas layout size for NDC conversion. */
  canvasWidth: number;
  canvasHeight: number;
  /** Drag-to-orbit: spherical angles (radians). */
  orbitTheta: number;
  orbitPhi: number;
  /** Shared autonomous network rotation (radians). */
  autoRotX: number;
  autoRotY: number;
  autoRotZ: number;
  /** Small autonomous rotation speeds (rad/s). */
  autoRotSpeedX: number;
  autoRotSpeedY: number;
  autoRotSpeedZ: number;
  /** Post FX controls. */
  postFxEnabled: boolean;
  postFxVignette: number;
  postFxChromatic: number;
  postFxGrain: number;
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
    pendingTapNdc: null,
    canvasWidth: 1,
    canvasHeight: 1,
    orbitTheta: 0,
    orbitPhi: 0.4,
    autoRotX: 0,
    autoRotY: 0,
    autoRotZ: 0,
    autoRotSpeedX: (Math.random() * 0.08 + 0.04) * (Math.random() > 0.5 ? 1 : -1),
    autoRotSpeedY: (Math.random() * 0.08 + 0.04) * (Math.random() > 0.5 ? 1 : -1),
    autoRotSpeedZ: (Math.random() * 0.04 + 0.02) * (Math.random() > 0.5 ? 1 : -1),
    postFxEnabled: true,
    postFxVignette: 0.14,
    postFxChromatic: 0.0,
    postFxGrain: 0.0,
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
