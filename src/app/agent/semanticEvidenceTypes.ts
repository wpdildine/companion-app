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

/**
 * Inventory of `kind` values appended from production call sites (orchestrator,
 * executeRequest, AgentSurface). Overlay rows use `String(VisualizationSignalEvent)` —
 * see `VisualizationSignalEvent` in visualizationSignals — so kinds there mirror that
 * union (including `shortTap`, `firstToken`, etc.; not every surface `short_tap`).
 * Runtime rows may still use other strings; this type is documentation + test anchor.
 */
export type ObservedEventKind =
  | 'onListeningStart'
  | 'onListeningEnd'
  | 'onRequestStart'
  | 'onRetrievalStart'
  | 'onRecoverableFailure'
  | 'onPlaybackStart'
  | 'onPlaybackEnd'
  | 'onTranscriptReadyForSubmit'
  | 'onTranscriptUpdate'
  | 'onError'
  | 'onGenerationStart'
  | 'onFirstToken'
  | 'onRetrievalEnd'
  | 'onGenerationEnd'
  | 'onComplete'
  | 'hold_end'
  | 'hold_rejected'
  | 'hold_accepted'
  | 'playback_tap_double'
  | 'playback_tap_single'
  | 'cluster_release'
  | 'reveal_panel'
  | 'clear_error'
  | 'short_tap'
  | 'tapCitation'
  | 'chunkAccepted'
  | 'warning'
  | 'tapCard'
  | 'softFail'
  | 'terminalFail'
  | 'firstToken'
  | 'shortTap';

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
  /** Denormalized mirror of `runtime` request-identity fields; not a second source of truth. */
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
