/**
 * 2D fallback when R3F is unavailable (e.g. Android).
 * Renders a dark background with a sphere-projected grid of dots that pulse with activity.
 * Never returns an empty View (plan: fallback must render a minimal field).
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { NodeMapEngineRef } from '../types';

const LOG_FALLBACK = true;

const DEFAULT_FALLBACK_BG = '#000000';
const NODE_COUNT = 72;
const SEED = 54321;

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface NodePoint {
  x: number; // 0..1 relative to width
  y: number; // 0..1 relative to height
  phase: number; // for twinkle
  size: number; // dot size in px
}

function buildFallbackNodes(): NodePoint[] {
  const rnd = mulberry32(SEED);
  const out: NodePoint[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const theta = rnd() * Math.PI * 2;
    const phi = Math.acos(2 * rnd() - 1);
    const r = 0.35 * Math.cbrt(rnd()); // radius in 0..1
    const x = 0.5 + r * Math.sin(phi) * Math.cos(theta);
    const y = 0.5 + r * Math.sin(phi) * Math.sin(theta);
    out.push({
      x,
      y,
      phase: rnd() * Math.PI * 2,
      size: 2 + 3 * rnd(),
    });
  }
  return out;
}

const NODES = buildFallbackNodes();

const POLL_MS = 120;

export function NodeMapCanvasFallback({
  nodeMapRef,
  canvasBackground = DEFAULT_FALLBACK_BG,
}: {
  nodeMapRef: React.RefObject<NodeMapEngineRef | null>;
  canvasBackground?: string;
}) {
  const { width, height } = useWindowDimensions();
  const [activity, setActivity] = useState(0.15);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (LOG_FALLBACK) console.log('[NodeMap] NodeMapCanvasFallback mounted (2D dots)', { width, height });
  }, [width, height]);

  useEffect(() => {
    const id = setInterval(() => {
      const target = nodeMapRef?.current?.targetActivity ?? 0.1;
      setActivity((a) => a * 0.85 + target * 0.15);
      setTick((n) => n + 1);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [nodeMapRef]);

  // Minimal field: render dots so fallback is never an empty View
  const opacity = 0.3 + activity * 0.5;
  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: canvasBackground }]}>
      {NODES.map((node, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              left: node.x * width - node.size,
              top: node.y * height - node.size,
              width: node.size * 2,
              height: node.size * 2,
              borderRadius: node.size,
              opacity: opacity * (0.7 + 0.3 * Math.sin(tick * 0.1 + node.phase)),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  dot: {
    position: 'absolute',
    backgroundColor: 'rgba(180, 140, 255, 0.9)',
  },
});
