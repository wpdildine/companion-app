/**
 * Fullscreen Node Map: R3F when available, otherwise 2D fallback (Lane B).
 * Loads R3F dynamically and uses an error boundary so R3F/expo-gl failures don't crash the app.
 */

import React, { Component, useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import type { VizEngineRef } from './types';
import { NodeMapFallback } from './NodeMapFallback';

/** Skip loading R3F on Android; expo-gl/R3F native often hits EventEmitter issues in bare RN new arch. */
const SKIP_R3F_ON_ANDROID = true;

type R3FComponentType = React.ComponentType<{
  vizRef: React.RefObject<VizEngineRef | null>;
}>;

type ErrorBoundaryState = { hasError: boolean };

class NodeMapErrorBoundary extends Component<
  {
    children: React.ReactNode;
    fallback: React.ReactNode;
    onCaught?: () => void;
  },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn(
      '[NodeMap] R3F canvas failed at render, using fallback:',
      error?.message ?? error,
    );
    this.props.onCaught?.();
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function NodeMapCanvas({ vizRef }: { vizRef: React.RefObject<VizEngineRef | null> }) {
  const [R3FComponent, setR3FComponent] = useState<R3FComponentType | null>(null);
  const [r3fFailed, setR3FFailed] = useState(false);

  useEffect(() => {
    if (r3fFailed) return;
    if (SKIP_R3F_ON_ANDROID && Platform.OS === 'android') {
      return;
    }
    try {
      const mod = require('./NodeMapCanvasR3F');
      if (mod?.NodeMapCanvasR3F) {
        setR3FComponent(() => mod.NodeMapCanvasR3F);
      }
    } catch (e) {
      console.warn(
        '[NodeMap] R3F canvas unavailable (load), using fallback:',
        e instanceof Error ? e.message : String(e),
      );
    }
  }, [r3fFailed]);

  const fallback = <NodeMapFallback vizRef={vizRef} />;

  if (!R3FComponent || r3fFailed) {
    return fallback;
  }

  return (
    <NodeMapErrorBoundary
      fallback={fallback}
      onCaught={() => setR3FFailed(true)}
    >
      <R3FComponent vizRef={vizRef} />
    </NodeMapErrorBoundary>
  );
}
