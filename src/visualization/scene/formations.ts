/**
 * GL scene “formations” (single aesthetic control plane).
 *
 * Contract:
 * - `getSceneDescription()` is the ONLY public entrypoint for GL aesthetics (zones/clusters/links/pulses/background/spine).
 * - GL components must consume `visualizationRef.current.scene` and must not introduce independent palette/layout constants.
 *
 * Organization rule:
 * - Keep this file as the contract + assembly layer.
 * - When logic grows, split implementation into helper modules under `src/visualization/scene/*`
 *   (e.g. builders/spine, artDirection) and have this file compose them.
 */

import type { CanonicalSceneMode } from './canonicalMode';
import type { GLSceneSpineRot } from './builders/buildSpineRotPlanes';
import type { GLSceneSpineLightCore } from './builders/buildSpineLightCore';
import { NEUTRAL_HALF_WIDTH_NDC } from '../interaction/zoneLayout';
import { seeded } from '../utils/rng';
import { hexToRgb } from '../utils/colors';

export interface Node {
  id: number;
  position: [number, number, number];
  connections: number[];
  level: number;
  type: number;
  size: number;
  distanceFromRoot: number;
  color: [number, number, number];
}

/**
 * Fixed cluster size: buildClusterNodesFromParams and buildLinkEdges use this; scene.maxPerCluster exposes it for glyph visibility and validation.
 * Making max-per-cluster dynamic is a deliberate future change: it must update cluster node generation, link topology, scene.maxPerCluster, and any consumer logic—do not change scene.maxPerCluster alone.
 */
const MAX_PER_CLUSTER = 8;

/** Cluster node: used by ContextGlyphs and ContextLinks; single source in scene.clusters.nodes */
export type ClusterNode = Node & {
  clusterId: number;
  indexInCluster: number;
  /** Z-layer index for context glyph depth stacking (0..N-1). */
  zLayer: number;
};

/** Two front-facing (2D) clusters (rules left, cards right). Max 8 per cluster, 16 total. Legacy; prefer scene.clusters.nodes. */
export function buildTwoClusters(): { nodes: ClusterNode[] } {
  return {
    nodes: buildClusterNodesFromParams({
      rulesRgb: [0.34, 0.58, 0.98],
      cardsRgb: [0.92, 0.42, 0.82],
      radius: 1.15,
      zJitter: 0.035,
      sizeBaseRules: 0.1,
      sizeJitterRules: 0.02,
      sizeBaseCards: 0.085,
      sizeJitterCards: 0.018,
    }),
  };
}

export type ClusterNodesParams = {
  rulesRgb: [number, number, number];
  cardsRgb: [number, number, number];
  radius: number;
  zJitter: number;
  sizeBaseRules: number;
  sizeJitterRules: number;
  sizeBaseCards: number;
  sizeJitterCards: number;
};

/** Build 16 cluster nodes from style/layout params; single source for positions and colors. */
export function buildClusterNodesFromParams(
  params: ClusterNodesParams,
): ClusterNode[] {
  const {
    rulesRgb,
    cardsRgb,
    radius,
    zJitter,
    sizeBaseRules,
    sizeJitterRules,
    sizeBaseCards,
    sizeJitterCards,
  } = params;
  const nodes: ClusterNode[] = [];
  for (let i = 0; i < MAX_PER_CLUSTER; i++) {
    const theta =
      (i / MAX_PER_CLUSTER) * Math.PI * 1.9 + seeded(i, 12.9898) * 0.35;
    const x = -radius * 0.62 + Math.cos(theta) * radius * 0.42;
    const y =
      Math.sin(theta) * radius * 0.52 + (seeded(i, 78.233) - 0.5) * 0.12;
    const z = (seeded(i, 37.719) - 0.5) * zJitter;
    nodes.push({
      id: i,
      position: [x, y, z],
      connections: [],
      level: 0,
      type: 0,
      size: sizeBaseRules + seeded(i, 37.719) * sizeJitterRules,
      distanceFromRoot: Math.sqrt(x * x + y * y) / (radius * 1.2),
      color: [...rulesRgb],
      clusterId: 0,
      indexInCluster: i,
      zLayer: 0,
    });
  }
  for (let i = 0; i < MAX_PER_CLUSTER; i++) {
    const theta =
      (i / MAX_PER_CLUSTER) * Math.PI * 1.9 + seeded(i + 8, 12.9898) * 0.35;
    const x = radius * 0.62 + Math.cos(theta) * radius * 0.42;
    const y =
      Math.sin(theta) * radius * 0.52 + (seeded(i + 8, 78.233) - 0.5) * 0.12;
    const z = (seeded(i + 8, 37.719) - 0.5) * zJitter;
    nodes.push({
      id: MAX_PER_CLUSTER + i,
      position: [x, y, z],
      connections: [],
      level: 1,
      type: 1,
      size: sizeBaseCards + seeded(i + 8, 37.719) * sizeJitterCards,
      distanceFromRoot: Math.sqrt(x * x + y * y) / (radius * 1.2),
      color: [...cardsRgb],
      clusterId: 1,
      indexInCluster: i,
      zLayer: 0,
    });
  }
  return nodes;
}

/** World-space centers of the two clusters for event pulses (tapCitation → rules, tapCard → cards). */
export function getTwoClusterCenters(): {
  rulesCenter: [number, number, number];
  cardsCenter: [number, number, number];
} {
  const { nodes } = buildTwoClusters();
  const rules = nodes.filter(n => n.clusterId === 0);
  const cards = nodes.filter(n => n.clusterId === 1);
  const sum = (
    arr: (Node & { clusterId: number; indexInCluster: number })[],
    i: 0 | 1 | 2,
  ) => arr.reduce((a, n) => a + n.position[i], 0) / arr.length;
  return {
    rulesCenter: [sum(rules, 0), sum(rules, 1), sum(rules, 2)],
    cardsCenter: [sum(cards, 0), sum(cards, 1), sum(cards, 2)],
  };
}

// --- GL scene description (single source of truth for zone/cluster/pulse aesthetics) ---

export type GLSceneZonesLayout = {
  leftRatio: number;
  centerRatio: number;
  rightRatio: number;
  bandTopInsetPx: number;
  deadStripThreshold: number;
};

export type GLSceneZonesStyle = {
  rulesColor: string;
  cardsColor: string;
  centerColor: string;
  areaPlaneOpacityRules: number;
  areaPlaneOpacityCenter: number;
  areaPlaneOpacityCards: number;
  edgeColor: string;
};

export type GLScenePulseAnchors = {
  rules: [number, number, number];
  cards: [number, number, number];
  center: [number, number, number];
};

export type GLSceneClustersStyle = {
  rulesRgb: [number, number, number];
  cardsRgb: [number, number, number];
};

export type GLSceneClustersLayout = {
  radius: number;
  zJitter: number;
  sizeBaseRules: number;
  sizeJitterRules: number;
  sizeBaseCards: number;
  sizeJitterCards: number;
};

export type GLSceneClusters = {
  style: GLSceneClustersStyle;
  layout: GLSceneClustersLayout;
  nodes: ClusterNode[];
};

export type GLSceneLinkEdge = {
  a: number;
  b: number;
  strength: number;
  pathIndex: number;
};

export type GLSceneLinks = {
  edges: GLSceneLinkEdge[];
  /** Must be >= 1. Zero means "no links" and is not a valid draw value. */
  segmentsPerEdge: number;
  /** Optional single Z for link mesh (builder-supplied). */
  z?: number;
};

/** Per-plane Z from builders; renderers use position.z = planes[i].z only. */
export type GLSceneBackgroundPlanes = {
  count: number;
  /** Builder-supplied final Z per plane. Length must match count. */
  planes: Array<{ z: number }>;
  opacityBase: number;
  opacitySecond: number;
  driftPxNorm: number;
  hue: number;
  sat: number;
  lum: number;
};

/** Back plane layer: rear structural slabs behind the spine. Z between spine and background; builder-owned. */
export type GLSceneBackPlane = {
  count: number;
  planes: Array<{
    z: number;
    scaleX?: number;
    scaleY?: number;
    opacityBase: number;
    driftScale?: number;
  }>;
  /** Optional: subtle parallax with camera/spine movement (e.g. 0.02–0.05). */
  parallaxScale?: number;
};

/** Draw-order section: renderOrderBase only; Z comes from builders. */
export type GLSceneLayerSection = { renderOrderBase: number };

export const GL_SCENE_LAYER_KEYS = [
  'background',
  'backPlane',
  'spineLightCore',
  'spineBase',
  'spineShards',
  'glyphsBack',
  'links',
  'glyphsFront',
  'spineRot',
  'debugOverlay',
] as const;
export type GLSceneLayers = Record<
  (typeof GL_SCENE_LAYER_KEYS)[number],
  GLSceneLayerSection
>;

export type GLSceneContextGlyphs = {
  baseNodeSize: number;
  pulseSpeed: number;
  touchRadius: number;
  touchStrength: number;
  touchMaxOffset: number;
  opacityScaleBack: number;
  opacityScaleFront: number;
  scaleBack: number;
  scaleFront: number;
  motionGainBack: number;
  motionGainFront: number;
  relaxSpeed: number;
  zLayerOffsets: number[];
  zLayerJitter: number;
  rulesClusterZBias: number;
  cardsClusterZBias: number;
  decayPhaseSeed: number;
  decayRateSeed: number;
  decayDepthSeed: number;
  decayRateMin: number;
  decayRateMax: number;
  decayDepthMin: number;
  decayDepthMax: number;
  zHierarchy: Array<{
    clusterId: number;
    layerIndex: number;
    zCenter: number;
    nodeIds: number[];
  }>;
};

export type GLSceneContextLinks = {
  pulseSpeed: number;
  showConfidenceBelow: number;
  requireFullIntensity: boolean;
  bezierControlXAmp: number;
  bezierControlYAmp: number;
  bezierControlZAmp: number;
};

export type GLScenePlaneField = {
  opacityClampMin: number;
  opacityClampMax: number;
  noisePhaseSpeed: number;
  smoothingSeconds: number;
  /** Depth field: radial falloff strength. */
  radialFalloffStrength: number;
  vignetteScale: number;
  halftoneDensityVariation: number;
  slowDriftScale: number;
  valueVariation: number;
  intensityProcessingBase: number;
  intensityProcessingActivityGain: number;
  intensityIdleBase: number;
  intensityIdleActivityGain: number;
  thresholdBase: number;
  thresholdAmp: number;
  thresholdHz: number;
  halftoneScaleBase: number;
  halftoneScaleAmp: number;
  halftoneScaleHz: number;
  basePlaneDepth: number;
  detailPlaneDepth: number;
  basePlaneScale: number;
  detailPlaneScale: number;
  panelOpacityScale: number;
  answerOpacityScale: number;
  cardsOpacityScale: number;
  rulesOpacityScale: number;
  rulesHueShiftH: number;
  rulesHueShiftS: number;
  rulesHueShiftL: number;
  answerPanelDepth: number;
  cardsPanelDepth: number;
  rulesPanelDepth: number;
};

export type { GLSceneSpine } from './builders/spine';
export type { GLSceneSpineRot } from './builders/buildSpineRotPlanes';
export type { GLSceneSpineLightCore } from './builders/buildSpineLightCore';

export type { CanonicalSceneMode } from './canonicalMode';

/** Optional overrides per mode; multiply/offset base art direction. Schema-only; renderers must not read yet. */
export type GLSceneBackgroundPresetOverrides = {
  driftSpeedScale?: number;
  maskContrastScale?: number;
  vignetteScale?: number;
  halftoneDensityScale?: number;
};
export type GLSceneSpinePresetOverrides = {
  opacityScale?: number;
  breathAmplitudeScale?: number;
  shardCountScale?: number;
  emissiveScale?: number;
};

export type GLScenePresets = Record<
  CanonicalSceneMode,
  {
    background?: GLSceneBackgroundPresetOverrides;
    spine?: GLSceneSpinePresetOverrides;
  }
>;

export type GLSceneTouchZone = {
  attract: boolean;
  strength: number;
  record?: boolean;
};
export type GLSceneTouchZones = {
  left: GLSceneTouchZone;
  right: GLSceneTouchZone;
  center: GLSceneTouchZone;
};
export type GLSceneTouchFeedback = {
  maxShear: number;
  maxRotateZ: number;
  damping: number;
  spring: number;
};
export type GLSceneTouchGlyphResponse = {
  repelStrength: number;
  nudgeRadius: number;
  parallaxBoost: number;
};

/** Organism signals: EngineLoop mutates this object each frame; getSceneDescription creates the stub once. */
export type GLSceneOrganism = {
  presence: number;
  focusBias: number;
  ndc: { x: number; y: number };
  zone: 'rules' | 'neutral' | 'cards' | null;
  relax: number;
  /** Optional: for Phase 4 flock/shard bias; not used in Phase 3. */
  shardBias?: number;
};

/** Motion grammar output: MotionGrammarEngine mutates this each frame; getSceneDescription creates the stub once. */
export type GLSceneMotionPhase = 'enter' | 'hold' | 'exit';

export type GLSceneMotion = {
  energy: number;
  tension: number;
  openness: number;
  settle: number;
  breath: number;
  attention: number;
  microMotion: number;
  phase: GLSceneMotionPhase;
  phaseT: number;
};

export type GLSceneDescription = {
  zones: {
    layout: GLSceneZonesLayout;
    style: GLSceneZonesStyle;
  };
  pulseAnchors: GLScenePulseAnchors;
  clusterAnchors: {
    rulesCenter: [number, number, number];
    cardsCenter: [number, number, number];
  };
  maxPerCluster: number;
  clusters: GLSceneClusters;
  links: GLSceneLinks;
  backgroundPlanes: GLSceneBackgroundPlanes;
  backPlane: GLSceneBackPlane;
  contextGlyphs: GLSceneContextGlyphs;
  contextLinks: GLSceneContextLinks;
  planeField: GLScenePlaneField;
  spine: GLSceneSpine;
  spineLightCore: GLSceneSpineLightCore;
  spineRot: GLSceneSpineRot;
  layers: GLSceneLayers;
  presets: GLScenePresets;
  touch: {
    zones: GLSceneTouchZones;
    feedback: GLSceneTouchFeedback;
    glyphResponse: GLSceneTouchGlyphResponse;
  };
  /** Organism signals; stub created here, EngineLoop mutates each frame. */
  organism: GLSceneOrganism;
  /** Motion grammar signals; stub created here, MotionGrammarEngine mutates each frame. */
  motion: GLSceneMotion;
};

export type GetSceneDescriptionOptions = {
  paletteId?: number;
  vizIntensityProfile?: string;
};

/** Build link topology: same-cluster ring + cross edges (matches ContextLinks layout). */
function buildLinkEdges(): GLSceneLinkEdge[] {
  const edges: GLSceneLinkEdge[] = [];
  let pathIndex = 0;
  const CLUSTER_SIZE = MAX_PER_CLUSTER;
  for (let c = 0; c < 2; c++) {
    const start = c * CLUSTER_SIZE;
    for (let i = 0; i < CLUSTER_SIZE; i++) {
      const a = start + i;
      const b = start + ((i + 1) % CLUSTER_SIZE);
      const d = start + ((i + 3) % CLUSTER_SIZE);
      edges.push({ a, b, strength: 0.9, pathIndex: pathIndex++ });
      edges.push({ a, b: d, strength: 0.55, pathIndex: pathIndex++ });
    }
  }
  return edges;
}

function applyContextGlyphZLayers(
  sourceNodes: ClusterNode[],
  glyphs: Omit<GLSceneContextGlyphs, 'zHierarchy'>,
): { nodes: ClusterNode[]; zHierarchy: GLSceneContextGlyphs['zHierarchy'] } {
  const offsets = glyphs.zLayerOffsets.length > 0 ? glyphs.zLayerOffsets : [0];
  const layerCount = offsets.length;
  const byKey = new Map<string, { clusterId: number; layerIndex: number; zCenter: number; nodeIds: number[] }>();
  const nodes = sourceNodes.map(node => {
    const layerIndex = ((node.indexInCluster % layerCount) + layerCount) % layerCount;
    const clusterBias = node.clusterId === 0 ? glyphs.rulesClusterZBias : glyphs.cardsClusterZBias;
    const jitterN = seeded(node.id + layerIndex * 17, 97.113) * 2 - 1;
    const z = offsets[layerIndex] + clusterBias + jitterN * glyphs.zLayerJitter;
    const next: ClusterNode = {
      ...node,
      position: [node.position[0], node.position[1], z],
      zLayer: layerIndex,
    };
    const key = `${node.clusterId}:${layerIndex}`;
    const entry = byKey.get(key) ?? {
      clusterId: node.clusterId,
      layerIndex,
      zCenter: offsets[layerIndex] + clusterBias,
      nodeIds: [],
    };
    entry.nodeIds.push(node.id);
    byKey.set(key, entry);
    return next;
  });
  return { nodes, zHierarchy: Array.from(byKey.values()) };
}

import { buildSpineDescription, type GLSceneSpine } from './builders/spine';
import { buildSpineRotPlanes } from './builders/buildSpineRotPlanes';
import { buildSpineLightCore } from './builders/buildSpineLightCore';
import { buildBackPlaneDescription } from './builders/backPlane';
import { buildContextGlyphsDescription } from './builders/contextGlyphs';
import { buildContextLinksDescription } from './builders/contextLinks';
import { buildPlaneLayerFieldDescription } from './builders/planeLayerField';

/** Schema-only; renderers must not read scene.presets yet. Overrides bias base art direction per mode. */
function buildScenePresets(): GLScenePresets {
  const modes: CanonicalSceneMode[] = ['idle', 'listening', 'processing', 'speaking'];
  const presets: GLScenePresets = {} as GLScenePresets;
  for (const mode of modes) {
    presets[mode] = {};
    if (mode === 'listening') {
      presets[mode].spine = { breathAmplitudeScale: 1.2 };
    }
    if (mode === 'processing') {
      presets[mode].background = { driftSpeedScale: 1.15, vignetteScale: 1.1 };
      presets[mode].spine = { opacityScale: 1.05, emissiveScale: 1.1 };
    }
    if (mode === 'speaking') {
      presets[mode].spine = { breathAmplitudeScale: 0.9 };
    }
  }
  return presets;
}

/**
 * Single source of truth for GL scene: zones, clusters (nodes + colors), links, pulse anchors, background planes, spine.
 * Computed on each call; store the result on visualizationRef.current.scene. _options is reserved for future use (e.g. paletteId, vizIntensityProfile).
 */
export function getSceneDescription(
  _options?: GetSceneDescriptionOptions,
): GLSceneDescription {
  const zonesStyle = {
    rulesColor: '#ffffff',
    cardsColor: '#2659d9',
    centerColor: '#bfc7e0',
    areaPlaneOpacityRules: 0.12,
    areaPlaneOpacityCenter: 0.035,
    areaPlaneOpacityCards: 0.12,
    edgeColor: '#00d4ff',
  };

  const clustersStyle: GLSceneClustersStyle = {
    rulesRgb: hexToRgb(zonesStyle.rulesColor),
    cardsRgb: hexToRgb(zonesStyle.cardsColor),
  };
  const clustersLayout: GLSceneClustersLayout = {
    radius: 1.15,
    zJitter: 0.035,
    sizeBaseRules: 0.1,
    sizeJitterRules: 0.02,
    sizeBaseCards: 0.085,
    sizeJitterCards: 0.018,
  };

  const nodes = buildClusterNodesFromParams({
    ...clustersStyle,
    ...clustersLayout,
  });
  const contextGlyphsBase = buildContextGlyphsDescription();
  const { nodes: layeredNodes, zHierarchy } = applyContextGlyphZLayers(
    nodes,
    contextGlyphsBase,
  );

  const rules = layeredNodes.filter(n => n.clusterId === 0);
  const cards = layeredNodes.filter(n => n.clusterId === 1);
  const sum = (arr: ClusterNode[], i: 0 | 1 | 2) =>
    arr.reduce((a, n) => a + n.position[i], 0) / arr.length;
  const rulesCenter: [number, number, number] = [
    sum(rules, 0),
    sum(rules, 1),
    sum(rules, 2),
  ];
  const cardsCenter: [number, number, number] = [
    sum(cards, 0),
    sum(cards, 1),
    sum(cards, 2),
  ];

  const planeField = buildPlaneLayerFieldDescription();
  const spine = buildSpineDescription();
  const spineLightCore = buildSpineLightCore();
  const spineRot = buildSpineRotPlanes();
  const backgroundPlanesWithZ = {
    count: 2,
    planes: [
      { z: planeField.basePlaneDepth },
      { z: planeField.detailPlaneDepth },
    ],
    opacityBase: 0.26,
    opacitySecond: 0.18,
    driftPxNorm: 1.2 / 500,
    hue: 0.6,
    sat: 0.45,
    lum: 0.55,
  };

  const backPlane = buildBackPlaneDescription(spine, backgroundPlanesWithZ);

  const centerRatio = 2 * NEUTRAL_HALF_WIDTH_NDC;
  const sideRatio = (1 - centerRatio) / 2;
  return {
    zones: {
      layout: {
        leftRatio: sideRatio,
        centerRatio,
        rightRatio: sideRatio,
        bandTopInsetPx: 112,
        deadStripThreshold: NEUTRAL_HALF_WIDTH_NDC,
      },
      style: zonesStyle,
    },
    pulseAnchors: {
      rules: rulesCenter,
      cards: cardsCenter,
      center: [0, 0, 0],
    },
    clusterAnchors: { rulesCenter, cardsCenter },
    maxPerCluster: MAX_PER_CLUSTER,
    clusters: {
      style: clustersStyle,
      layout: clustersLayout,
      nodes: layeredNodes,
    },
    links: {
      edges: buildLinkEdges(),
      segmentsPerEdge: 12,
      z: 0,
    },
    backgroundPlanes: backgroundPlanesWithZ,
    backPlane,
    layers: {
      background: { renderOrderBase: 1000 },
      backPlane: { renderOrderBase: 1250 },
      glyphsBack: { renderOrderBase: 1500 },
      spineLightCore: { renderOrderBase: 2000 },
      spineBase: { renderOrderBase: 2100 },
      spineShards: { renderOrderBase: 2200 },
      links: { renderOrderBase: 3200 },
      glyphsFront: { renderOrderBase: 3500 },
      spineRot: { renderOrderBase: 3600 },
      debugOverlay: { renderOrderBase: 4000 },
    },
    presets: buildScenePresets(),
    touch: {
      zones: {
        left: { attract: true, strength: 0.9 },
        right: { attract: true, strength: 0.9 },
        center: { record: true, attract: false, strength: 0 },
      },
      feedback: {
        maxShear: 0.22,
        maxRotateZ: 0.12,
        damping: 10,
        spring: 120,
      },
      glyphResponse: {
        repelStrength: 0.8,
        nudgeRadius: 0.35,
        parallaxBoost: 0.15,
      },
    },
    contextGlyphs: {
      ...contextGlyphsBase,
      zHierarchy,
    },
    contextLinks: buildContextLinksDescription(),
    planeField,
    spine,
    spineLightCore,
    spineRot,
    organism: {
      presence: 0,
      focusBias: 0,
      ndc: { x: 0, y: 0 },
      zone: null,
      relax: 1,
    },
    motion: {
      energy: 0,
      tension: 0,
      openness: 0,
      settle: 0,
      breath: 0,
      attention: 0,
      microMotion: 0,
      phase: 'hold',
      phaseT: 0,
    },
  };
}
