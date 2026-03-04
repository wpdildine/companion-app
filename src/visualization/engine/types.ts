/**
 * Visualization engine: state ref shape and mode type.
 * Discrete mode in React; continuous animation in render loop via this ref.
 */

import type { GLSceneDescription } from '../scene/formations';

export type VisualizationMode =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'touched'
  | 'released';

/** UI-semantic signals for the visualization layer only. Not render params. */
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

export type VisualizationIntensity = 'off' | 'subtle' | 'full';

export type VisualizationPanelRects = {
  answer?: { x: number; y: number; w: number; h: number };
  cards?: { x: number; y: number; w: number; h: number };
  rules?: { x: number; y: number; w: number; h: number };
};

export interface VisualizationEngineRef {
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
  currentMode: VisualizationMode;
  /** Post FX controls. */
  postFxEnabled: boolean;
  postFxVignette: number;
  postFxChromatic: number;
  postFxGrain: number;
  /** Viz intensity: off | subtle | full. Default subtle until later. */
  vizIntensity: VisualizationIntensity;
  /** Reduce motion (accessibility). */
  reduceMotion: boolean;
  /** Last semantic event (for pulse/ripple). */
  lastEvent: AiUiSignalsEvent;
  /** Time of last event (clock or elapsed). */
  lastEventTime: number;
  /** Optional snapshot for debug. */
  signalsSnapshot?: AiUiSignals;
  /** Panel rects in viewport-relative screen px (account for scroll before writing). VisualizationSurface provides viewport size; GL converts to normalized. */
  panelRects?: VisualizationPanelRects;
  /** Derived in applySignalsToVisualization from signals (not in signals API). */
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
  /** Spine planes: true = per-plane halftone shader, false = solid MeshBasicMaterial. Toggle in Dev panel. */
  spineUseHalftonePlanes: boolean;
  /** Dev: cycle-all-states toggle and timer (persists when panel closes). */
  stateCycleOn: boolean;
  stateCycleTimerId: ReturnType<typeof setInterval> | null;
  stateCycleIdx: number;
  /** Dev: cycle-canonical toggle and timer (persists when panel closes). */
  canonicalCycleOn: boolean;
  canonicalCycleTimerId: ReturnType<typeof setInterval> | null;
  canonicalCycleIdx: number;
}
