/**
 * 2D fallback node map when R3F is unavailable (e.g. Android).
 * Renders a dark background with a sphere-projected grid of dots that pulse with activity.
 * No extra deps; drives visibility from vizRef.targetActivity.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { VizEngineRef } from '../types';

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

export function NodeMapFallback({
  vizRef,
  canvasBackground = DEFAULT_FALLBACK_BG,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
  canvasBackground?: string;
}) {
  const { width, height } = useWindowDimensions();
  const [activity, setActivity] = useState(0.15);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (LOG_FALLBACK) console.log('[NodeMap] NodeMapFallback mounted (2D dots)', { width, height });
  }, [width, height]);

  useEffect(() => {
    const id = setInterval(() => {
      const target = vizRef?.current?.targetActivity ?? 0.1;
      setActivity((a) => a * 0.85 + target * 0.15);
      setTick((n) => n + 1);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [vizRef]);

  const time = tick * (POLL_MS / 1000);

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: canvasBackground }]} />
  );
}

const styles = StyleSheet.create({
  root: {},
});
