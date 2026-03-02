/**
 * Node map: engine state ref shape and mode type.
 * Plan: discrete mode in React; continuous animation in render loop via this ref.
 */

import type { GLSceneDescription } from './helpers/formations';

export type NodeMapMode =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'touched'
  | 'released';

/** UI-semantic signals for the node map layer only. Not render params. */
export type AiUiSignalsEvent =
  | 'tapCitation'
  | 'chunkAccepted'
  | 'warning'
  | 'tapCard'
  | null;

export type AiUiSignals = {
  phase: 'idle' | 'processing' | 'resolved';
  grounded: boolean;
  confidence: number; // 0..1
  retrievalDepth: number; // count of selected rule snippets
  cardRefsCount: number; // count of referenced cards
  event?: AiUiSignalsEvent;
};

export interface TouchNdc {
  x: number;
  y: number;
}

export type NodeMapIntensity = 'off' | 'subtle' | 'full';

export type NodeMapPanelRects = {
  answer?: { x: number; y: number; w: number; h: number };
  cards?: { x: number; y: number; w: number; h: number };
  rules?: { x: number; y: number; w: number; h: number };
};

export interface NodeMapEngineRef {
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
  starCountMultiplier: number;
  touchActive: boolean;
  touchNdc: TouchNdc;
  touchWorld: [number, number, number] | null;
  /** Touch in view space (camera.matrixWorldInverse * touchWorld) for shader repulsion. */
  touchView: [number, number, number] | null;
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
  /** Current app mode so render layers can map state-specific effects. */
  currentMode: NodeMapMode;
  /** Post FX controls. */
  postFxEnabled: boolean;
  postFxVignette: number;
  postFxChromatic: number;
  postFxGrain: number;
  /** Viz intensity: off | subtle | full. Default subtle until later. */
  vizIntensity: NodeMapIntensity;
  /** Reduce motion (accessibility). */
  reduceMotion: boolean;
  /** Last semantic event (for pulse/ripple). */
  lastEvent: AiUiSignalsEvent;
  /** Time of last event (clock or elapsed). */
  lastEventTime: number;
  /** Optional snapshot for debug. */
  signalsSnapshot?: AiUiSignals;
  /** Panel rects in viewport-relative screen px (account for scroll before writing). NodeMapSurface provides viewport size; GL converts to normalized. */
  panelRects?: NodeMapPanelRects;
  /** Derived in applySignalsToNodeMap from signals (not in signals API). */
  rulesClusterCount: number;
  cardsClusterCount: number;
  layerCount: number;
  deconWeight: number;
  planeOpacity: number;
  driftPx: number;
  /** Canvas-owned touch field for repulsion (interaction band only). */
  touchFieldActive: boolean;
  touchFieldNdc: [number, number] | null;
  touchFieldStrength: number;
  /** GL scene description; set at mount or when paletteId/vizIntensityProfile changes. All GL components read from this. */
  scene?: GLSceneDescription;
  /** Zone currently under touch (for armed state). Set by interaction band. */
  zoneArmed: 'rules' | 'cards' | null;
  /** Show touch zone debug meshes (rules/center/cards). Default off; toggle in Dev panel. */
  showTouchZones: boolean;
}

const SENTINEL_FAR = 1e6;

export function createDefaultNodeMapRef(): NodeMapEngineRef {
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
    starCountMultiplier: 1,
    touchActive: false,
    touchNdc: { x: 0, y: 0 },
    touchWorld: null,
    touchView: null,
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
    currentMode: 'idle',
    postFxEnabled: false,
    postFxVignette: 0.14,
    postFxChromatic: 0.0,
    postFxGrain: 0.0,
    vizIntensity: 'subtle',
    reduceMotion: false,
    lastEvent: null,
    lastEventTime: 0,
    signalsSnapshot: undefined,
    panelRects: undefined,
    rulesClusterCount: 0,
    cardsClusterCount: 0,
    layerCount: 2,
    deconWeight: 0.2,
    planeOpacity: 0.28,
    driftPx: 2,
    touchFieldActive: false,
    touchFieldNdc: null,
    touchFieldStrength: 0,
    scene: undefined,
    zoneArmed: null,
    showTouchZones: false,
  };
}

/** targetActivity by mode (plan §1) */
export const TARGET_ACTIVITY_BY_MODE: Record<NodeMapMode, number> = {
  idle: 0.1,
  listening: 0.6,
  processing: 1.0,
  speaking: 0.7,
  touched: 0.5,
  released: 0.6, // brief then listening
};
