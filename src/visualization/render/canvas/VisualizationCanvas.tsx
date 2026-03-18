/**
 * Fullscreen node map canvas: R3F when available, otherwise 2D fallback (Lane B).
 * Loads R3F dynamically and uses an error boundary so R3F/expo-gl failures don't crash the app.
 */

import React, {
  Component,
  useEffect,
  useState,
} from 'react';
import { NativeModules, Platform } from 'react-native';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';
import type { TouchCallbacks } from '../../interaction/touchHandlers';
import { VisualizationCanvasFallback } from './VisualizationCanvasFallback';

/** Skip loading R3F on Android; set false to try R3F + expo-gl on Android. */
const SKIP_R3F_ON_ANDROID = false;
const R3F_EXPO_WAIT_TIMEOUT_MS = 6000;
const R3F_EXPO_WAIT_POLL_MS = 150;

type VisualizationCanvasProps = {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  controlsEnabled: boolean;
  inputEnabled: boolean;
  canvasBackground?: string;
  clusterZoneHighlights?: boolean;
} & TouchCallbacks;

type R3FComponentType = React.ComponentType<VisualizationCanvasProps>;

type ErrorBoundaryState = { hasError: boolean };

class VisualizationErrorBoundary extends Component<
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
      '[Visualization] R3F canvas failed at render, using fallback:',
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

export function VisualizationCanvas({
  visualizationRef,
  controlsEnabled,
  inputEnabled,
  canvasBackground,
  clusterZoneHighlights = false,
  onShortTap,
  onClusterTap,
  onDoubleTap,
  onLongPressStart,
  onLongPressEnd,
  onDragStart,
  onDragMove,
  onDragEnd,
}: VisualizationCanvasProps) {
  const [R3FComponent, setR3FComponent] = useState<R3FComponentType | null>(null);
  const [r3fFailed, setR3FFailed] = useState(false);

  useEffect(() => {
    if (r3fFailed) {
      return;
    }
    if (SKIP_R3F_ON_ANDROID && Platform.OS === 'android') {
      return;
    }
    let cancelled = false;

    const tryLoadR3F = () => {
      if (cancelled) return;
      try {
        const mod = require('./VisualizationCanvasR3F');
        if (mod?.VisualizationCanvasR3F) {
          setR3FComponent(() => mod.VisualizationCanvasR3F);
        } else {
          console.warn('[Visualization] R3F module missing VisualizationCanvasR3F export');
        }
      } catch (e) {
        console.warn(
          '[Visualization] R3F canvas unavailable (load), using fallback:',
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
          tryLoadR3F();
          return true;
        }
        if (Date.now() - startedAt > R3F_EXPO_WAIT_TIMEOUT_MS) {
          console.warn(
            `[Visualization] Expo EventEmitter not ready after ${R3F_EXPO_WAIT_TIMEOUT_MS}ms; staying on fallback`,
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
    <VisualizationCanvasFallback
      visualizationRef={visualizationRef}
      canvasBackground={canvasBackground}
    />
  );
  const fallback = dotsOnlyFallback;

  if (!R3FComponent || r3fFailed) {
    return fallback;
  }

  return (
    <VisualizationErrorBoundary
      fallback={fallback}
      onCaught={() => setR3FFailed(true)}
    >
      <R3FComponent
        visualizationRef={visualizationRef}
        controlsEnabled={controlsEnabled}
        inputEnabled={inputEnabled}
        canvasBackground={canvasBackground}
        clusterZoneHighlights={clusterZoneHighlights}
        onShortTap={onShortTap}
        onClusterTap={onClusterTap}
        onDoubleTap={onDoubleTap}
        onLongPressStart={onLongPressStart}
        onLongPressEnd={onLongPressEnd}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />
    </VisualizationErrorBoundary>
  );
}
