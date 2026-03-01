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
function fibonacciSphere(n: number, radius: number): [number, number, number][] {
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
): { nodes: Node[]; edges: { a: number; b: number; strength: number; pathIndex: number }[] } {
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
      const distanceFromRoot = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2) / (radii[radii.length - 1] || 1);
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

  const edges: { a: number; b: number; strength: number; pathIndex: number }[] = [];
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

const MAX_PER_CLUSTER = 8;
const RULES_COLOR: [number, number, number] = [0.35, 0.55, 1.0];
const CARDS_COLOR: [number, number, number] = [0.95, 0.35, 0.85];

/** Seeded pseudo-random in [0,1] */
function seeded(i: number, seed: number): number {
  return Math.abs(Math.sin((i + 1) * seed));
}

/** Two clusters (rules left, cards right) for GlyphNodes. Max 8 per cluster, 16 total. */
export function buildTwoClusters(): {
  nodes: (Node & { clusterId: number; indexInCluster: number })[];
} {
  const nodes: (Node & { clusterId: number; indexInCluster: number })[] = [];
  const radius = 1.2;
  for (let i = 0; i < MAX_PER_CLUSTER; i++) {
    const theta = (i / MAX_PER_CLUSTER) * Math.PI * 1.2 + seeded(i, 12.9898) * 0.4;
    const phi = seeded(i, 78.233) * Math.PI * 0.6;
    const x = -radius * 0.6 + Math.cos(phi) * Math.sin(theta) * radius * 0.5;
    const y = (i / MAX_PER_CLUSTER - 0.5) * 1.2;
    const z = Math.cos(theta) * radius * 0.5;
    nodes.push({
      id: i,
      position: [x, y, z],
      connections: [],
      level: 0,
      type: 0,
      size: 0.06 + seeded(i, 37.719) * 0.04,
      distanceFromRoot: Math.sqrt(x * x + y * y + z * z) / (radius * 1.2),
      color: [...RULES_COLOR],
      clusterId: 0,
      indexInCluster: i,
    });
  }
  for (let i = 0; i < MAX_PER_CLUSTER; i++) {
    const theta = (i / MAX_PER_CLUSTER) * Math.PI * 1.2 + seeded(i + 8, 12.9898) * 0.4;
    const phi = seeded(i + 8, 78.233) * Math.PI * 0.6;
    const x = radius * 0.6 + Math.cos(phi) * Math.sin(theta) * radius * 0.5;
    const y = (i / MAX_PER_CLUSTER - 0.5) * 1.2;
    const z = Math.cos(theta) * radius * 0.5;
    nodes.push({
      id: MAX_PER_CLUSTER + i,
      position: [x, y, z],
      connections: [],
      level: 1,
      type: 1,
      size: 0.06 + seeded(i + 8, 37.719) * 0.04,
      distanceFromRoot: Math.sqrt(x * x + y * y + z * z) / (radius * 1.2),
      color: [...CARDS_COLOR],
      clusterId: 1,
      indexInCluster: i,
    });
  }
  return { nodes };
}

/** World-space centers of the two clusters for event pulses (tapCitation → rules, tapCard → cards). */
export function getTwoClusterCenters(): {
  rulesCenter: [number, number, number];
  cardsCenter: [number, number, number];
} {
  const { nodes } = buildTwoClusters();
  const rules = nodes.filter(n => n.clusterId === 0);
  const cards = nodes.filter(n => n.clusterId === 1);
  const sum = (arr: (Node & { clusterId: number; indexInCluster: number })[], i: 0 | 1 | 2) =>
    arr.reduce((a, n) => a + n.position[i], 0) / arr.length;
  return {
    rulesCenter: [sum(rules, 0), sum(rules, 1), sum(rules, 2)],
    cardsCenter: [sum(cards, 0), sum(cards, 1), sum(cards, 2)],
  };
}
