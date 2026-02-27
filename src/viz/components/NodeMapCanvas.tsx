/**
 * Fullscreen Node Map: R3F when available, otherwise 2D fallback (Lane B).
 * Loads R3F dynamically and uses an error boundary so R3F/expo-gl failures don't crash the app.
 */

import React, { Component, useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import type { VizEngineRef } from '../types';
import type { TouchCallbacks } from '../interaction/touchHandlers';
import { NodeMapFallback } from './NodeMapFallback';

/** Skip loading R3F on Android; set false to try R3F + expo-gl on Android. */
const SKIP_R3F_ON_ANDROID = false;
const R3F_EXPO_WAIT_TIMEOUT_MS = 6000;
const R3F_EXPO_WAIT_POLL_MS = 150;

type NodeMapCanvasProps = {
  vizRef: React.RefObject<VizEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  canvasBackground?: string;
} & TouchCallbacks;

type R3FComponentType = React.ComponentType<NodeMapCanvasProps>;

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

export function NodeMapCanvas({
  vizRef,
  controlsEnabled,
  inputEnabled,
  canvasBackground,
  onShortTap,
  onDoubleTap,
  onLongPressStart,
  onLongPressEnd,
  onDragStart,
  onDragMove,
  onDragEnd,
}: NodeMapCanvasProps) {
  const [R3FComponent, setR3FComponent] = useState<R3FComponentType | null>(null);
  const [r3fFailed, setR3FFailed] = useState(false);

  useEffect(() => {
    console.log('[NodeMap] init: platform=', Platform.OS, 'r3fFailed=', r3fFailed);
    if (r3fFailed) {
      console.log('[NodeMap] skipping R3F load (already failed)');
      return;
    }
    if (SKIP_R3F_ON_ANDROID && Platform.OS === 'android') {
      console.log('[NodeMap] using fallback (SKIP_R3F_ON_ANDROID=true)');
      return;
    }
    let cancelled = false;

    const tryLoadR3F = () => {
      if (cancelled) return;
      try {
        const mod = require('./NodeMapCanvasR3F');
        if (mod?.NodeMapCanvasR3F) {
          console.log('[NodeMap] R3F module loaded, mounting Canvas');
          setR3FComponent(() => mod.NodeMapCanvasR3F);
        } else {
          console.warn('[NodeMap] R3F module missing NodeMapCanvasR3F export');
        }
      } catch (e) {
        console.warn(
          '[NodeMap] R3F canvas unavailable (load), using fallback:',
          e instanceof Error ? e.message : String(e),
        );
      }
    };

    // Android bridgeless/new-arch: wait until Expo modules are installed
    // before loading R3F (which imports expo-file-system at module init).
    if (Platform.OS === 'android') {
      const startedAt = Date.now();
      const isExpoReady = () =>
        !!(globalThis as { expo?: { EventEmitter?: unknown } }).expo?.EventEmitter;

      const tick = () => {
        if (cancelled) return true;
        try {
          (NativeModules as { ExpoModulesCore?: { installModules?: () => void } })
            .ExpoModulesCore?.installModules?.();
        } catch {
          // no-op; we'll keep polling until timeout
        }
        if (isExpoReady()) {
          console.log('[NodeMap] Expo EventEmitter ready; loading R3F');
          tryLoadR3F();
          return true;
        }
        if (Date.now() - startedAt > R3F_EXPO_WAIT_TIMEOUT_MS) {
          console.warn(
            `[NodeMap] Expo EventEmitter not ready after ${R3F_EXPO_WAIT_TIMEOUT_MS}ms; staying on fallback`,
          );
          return true;
        }
        return false;
      };

      if (tick()) {
        return () => {
          cancelled = true;
        };
      }
      const id = setInterval(() => {
        if (tick()) clearInterval(id);
      }, R3F_EXPO_WAIT_POLL_MS);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }

    tryLoadR3F();
    return () => {
      cancelled = true;
    };
  }, [r3fFailed]);

  const dotsOnlyFallback = (
    <NodeMapFallback vizRef={vizRef} canvasBackground={canvasBackground} />
  );
  const fallback = dotsOnlyFallback;

  if (!R3FComponent || r3fFailed) {
    console.log('[NodeMap] render: fallback (no R3F)', { hasR3F: !!R3FComponent, r3fFailed });
    return fallback;
  }

  console.log('[NodeMap] render: R3F Canvas path');

  return (
    <NodeMapErrorBoundary
      fallback={fallback}
      onCaught={() => setR3FFailed(true)}
    >
      <R3FComponent
        vizRef={vizRef}
        controlsEnabled={controlsEnabled}
        inputEnabled={inputEnabled}
        canvasBackground={canvasBackground}
        onShortTap={onShortTap}
        onDoubleTap={onDoubleTap}
        onLongPressStart={onLongPressStart}
        onLongPressEnd={onLongPressEnd}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />
    </NodeMapErrorBoundary>
  );
}
