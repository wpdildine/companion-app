/**
 * Read-only semantic evidence aggregation types.
 * Observed events mirror existing callbacks only; no new truth.
 */

import type { AgentOrchestratorState } from './types';

export type ObservedEventSource =
  | 'orchestrator'
  | 'surface'
  | 'interaction'
  | 'overlay';

/** Appended at existing listener/handler sites only; kind is a stable string id. */
export type ObservedEvent = {
  kind: string;
  source: ObservedEventSource;
  timestamp: number;
  payload?: Record<string, unknown>;
};

export type OutcomeProjectionClass =
  | 'success'
  | 'recoverable'
  | 'terminal'
  | 'blocked';

export type OutcomeProjectionSource =
  | 'lifecycle'
  | 'error'
  | 'frontDoor'
  | 'listener';

export type OutcomeProjection = {
  class: OutcomeProjectionClass;
  source: OutcomeProjectionSource;
};

export type SemanticSurfaceState = {
  interactionBandEnabled: boolean;
  activeInteractionOwner:
    | 'none'
    | 'holdToSpeak'
    | 'swipeContext'
    | 'playbackTap'
    | 'overlay'
    | 'debug';
  revealedBlocks: {
    answer: boolean;
    cards: boolean;
    rules: boolean;
    sources: boolean;
  };
  debugEnabled: boolean;
};

export type SemanticPresentationState = {
  playActAccessibilityLabel?: string;
  playActPhaseCaptionText?: string | null;
};

export type SemanticEvidence = {
  runtime: AgentOrchestratorState;
  identity: {
    activeRequestId: number | null;
    requestInFlight: boolean;
    playbackRequestId: number | null;
  };
  surface: SemanticSurfaceState;
  interaction: {
    observedEvents: readonly ObservedEvent[];
  };
  presentation: SemanticPresentationState;
  outcome: OutcomeProjection | null;
};
