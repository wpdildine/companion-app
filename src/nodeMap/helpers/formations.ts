/**
 * Node class and Crystalline Sphere formation for the node map.
 * Reference: Quantum Neural Network style — Fibonacci layers + lateral + long-range edges.
 */

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

/** Fibonacci sphere: N points distributed on a sphere */
function fibonacciSphere(
  n: number,
  radius: number,
): [number, number, number][] {
  const points: [number, number, number][] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    points.push([
      Math.cos(theta) * r * radius,
      y * radius,
      Math.sin(theta) * r * radius,
    ]);
  }
  return points;
}

/** Default node palette (RGB 0–1). Overridable via optional nodePalette from theme. */
const DEFAULT_NODE_PALETTE: [number, number, number][] = [
  [0.4, 0.2, 0.8],
  [0.5, 0.25, 0.85],
  [0.6, 0.3, 0.9],
  [0.35, 0.15, 0.75],
];

/** Crystalline Sphere: multiple Fibonacci layers, lateral and long-range connections */
export function buildCrystallineSphere(
  nodesPerLayer: number[] = [24, 48, 96, 128],
  radii: number[] = [0.9, 1.5, 2.1, 2.6],
  lateralK = 2,
  longRangeK = 1,
  nodePalette?: [number, number, number][],
): {
  nodes: Node[];
  edges: { a: number; b: number; strength: number; pathIndex: number }[];
} {
  const palette = nodePalette?.length ? nodePalette : DEFAULT_NODE_PALETTE;
  const nodes: Node[] = [];
  let id = 0;
  const layerStarts: number[] = [];

  for (let L = 0; L < nodesPerLayer.length; L++) {
    const n = nodesPerLayer[L];
    const r = radii[L];
    const positions = fibonacciSphere(n, r);
    layerStarts.push(nodes.length);
    const color = palette[L % palette.length];
    for (let i = 0; i < n; i++) {
      const pos = positions[i];
      const distanceFromRoot =
        Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2) /
        (radii[radii.length - 1] || 1);
      nodes.push({
        id: id++,
        position: [pos[0], pos[1], pos[2]],
        connections: [],
        level: L,
        type: L % 3,
        size: 0.08 + 0.04 * (1 - L / Math.max(1, nodesPerLayer.length)),
        distanceFromRoot,
        color: [...color],
      });
    }
  }

  const edges: { a: number; b: number; strength: number; pathIndex: number }[] =
    [];
  let pathIndex = 0;

  // Lateral: within same layer, connect each node to next K
  for (let L = 0; L < nodesPerLayer.length; L++) {
    const start = layerStarts[L];
    const count = nodesPerLayer[L];
    for (let i = 0; i < count; i++) {
      for (let k = 1; k <= lateralK; k++) {
        const j = (i + k) % count;
        const a = start + i;
        const b = start + j;
        if (!nodes[a].connections.includes(b)) {
          nodes[a].connections.push(b);
          edges.push({ a, b, strength: 1 - k * 0.15, pathIndex: pathIndex++ });
        }
      }
    }
  }

  // Long-range: connect layer L to layer L+1 (nearest neighbor)
  for (let L = 0; L < nodesPerLayer.length - 1; L++) {
    const fromStart = layerStarts[L];
    const fromCount = nodesPerLayer[L];
    const toStart = layerStarts[L + 1];
    const toCount = nodesPerLayer[L + 1];
    for (let k = 0; k < longRangeK; k++) {
      for (let i = 0; i < fromCount; i++) {
        const j = Math.floor((i / fromCount) * toCount) % toCount;
        const a = fromStart + i;
        const b = toStart + j;
        if (!nodes[a].connections.includes(b)) {
          nodes[a].connections.push(b);
          edges.push({ a, b, strength: 0.7, pathIndex: pathIndex++ });
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Fixed cluster size: buildClusterNodesFromParams and buildLinkEdges use this; scene.maxPerCluster exposes it for glyph visibility and validation.
 * Making max-per-cluster dynamic is a deliberate future change: it must update cluster node generation, link topology, scene.maxPerCluster, and any consumer logic—do not change scene.maxPerCluster alone.
 */
const MAX_PER_CLUSTER = 8;

/** Cluster node: used by ContextGlyphs and ContextLinks; single source in scene.clusters.nodes */
export type ClusterNode = Node & { clusterId: number; indexInCluster: number };

/** Seeded pseudo-random in [0,1] */
function seeded(i: number, seed: number): number {
  return Math.abs(Math.sin((i + 1) * seed));
}

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
};

export type GLSceneBackgroundPlanes = {
  count: number;
  opacityBase: number;
  opacitySecond: number;
  driftPxNorm: number;
  hue: number;
  sat: number;
  lum: number;
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

/** Hex to RGB 0–1. Expects #RRGGBB (7 chars); validates in dev to avoid silent garbage. */
function hexToRgb(hex: string): [number, number, number] {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      throw new Error(
        `hexToRgb: expected #RRGGBB, got "${hex}". Use 6-digit hex (e.g. #ffffff).`,
      );
    }
  }
  const n = parseInt(hex.slice(1), 16);
  return [
    Math.floor(n / 65536) / 255,
    Math.floor((n % 65536) / 256) / 255,
    (n % 256) / 255,
  ];
}

/**
 * Single source of truth for GL scene: zones, clusters (nodes + colors), links, pulse anchors, background planes.
 * Computed on each call; store the result on nodeMapRef.current.scene. _options is reserved for future use (e.g. paletteId, vizIntensityProfile).
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

  const rules = nodes.filter(n => n.clusterId === 0);
  const cards = nodes.filter(n => n.clusterId === 1);
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

  return {
    zones: {
      layout: {
        leftRatio: 0.44,
        centerRatio: 0.12,
        rightRatio: 0.44,
        bandTopInsetPx: 112,
        deadStripThreshold: 0.12,
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
      nodes,
    },
    links: {
      edges: buildLinkEdges(),
      segmentsPerEdge: 12,
    },
    backgroundPlanes: {
      count: 0,
      opacityBase: 0.28,
      opacitySecond: 0.2,
      driftPxNorm: 2 / 500,
      hue: 0.6,
      sat: 0.45,
      lum: 0.55,
    },
  };
}
