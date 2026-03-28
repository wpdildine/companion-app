/**
 * Agent architecture: normalized lifecycle and event contracts.
 * AgentOrchestrator owns runtime truth; VisualizationController consumes these.
 */

import type { SemanticFrontDoor } from '@atlas/runtime';
import type { ValidationSummary } from '../../rag';

/** Latest front-door-blocked outcome for control/presentation binding; not a semantic cache. */
export type LastFrontDoorOutcome = {
  requestId: number;
  semanticFrontDoor: SemanticFrontDoor;
};

/** Normalized agent lifecycle state. Provider-agnostic. */
export type AgentLifecycleState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

/** Processing substate: meaningful only when lifecycle === 'processing'; otherwise null. 'fallback' is reserved for explicit fallback paths only; main pipeline never sets it unless such a path is implemented. */
export type ProcessingSubstate =
  | 'retrieving'
  | 'preparingContext'
  | 'loadingModel'
  | 'awaitingFirstToken'
  | 'streaming'
  | 'validating'
  | 'settling'
  | 'fallback';

/** Optional metadata for visualization or overlay. */
export type AgentStateMetadata = {
  confidence?: number;
  sourceType?: string;
  streamingProgress?: number;
  latencyPressure?: boolean;
  groundedness?: boolean;
  requestPhase?: string;
};

/**
 * Normalized events emitted by AgentOrchestrator for VisualizationController.
 * Submit contract: submit-worthy = non-empty normalized transcript (candidate input at submit time);
 * request accepted = request_start (same boundary as processing start).
 */
export interface AgentOrchestratorListeners {
  onListeningStart?: () => void;
  onListeningEnd?: () => void;
  /** Called once when transcript is ready after stopListeningAndRequestSubmit (submit must only be triggered from this path for hold-to-speak release). */
  onTranscriptReadyForSubmit?: () => void;
  onTranscriptUpdate?: () => void;
  onRequestStart?: () => void;
  onRetrievalStart?: () => void;
  onRetrievalEnd?: () => void;
  onGenerationStart?: () => void;
  onFirstToken?: () => void;
  onGenerationEnd?: () => void;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onComplete?: () => void;
  /** Recoverable rejection/failure that returns cleanly to idle; maps to transient softFail. */
  onRecoverableFailure?: (reason: string, details?: Record<string, unknown>) => void;
  /** Terminal request or fatal speech failure. Visualization may project a distinct transient from details only; orchestrator still owns semantics. */
  onError?: (reason?: string, details?: Record<string, unknown>) => void;
}

/** State emitted by AgentOrchestrator. Single source of truth for agent runtime. */
export interface AgentOrchestratorState {
  lifecycle: AgentLifecycleState;
  /** Meaningful only when lifecycle === 'processing'; otherwise null. */
  processingSubstate: ProcessingSubstate | null;
  error: string | null;
  voiceReady: boolean;
  transcribedText: string;
  /**
   * Single response state. During streaming (processingSubstate === 'streaming') holds partial
   * accumulated text; at settlement holds final nudged text (or orchestrator-applied empty fallback).
   * No separate partial/final slots; overlay reads this plus lifecycle/substate only.
   */
  responseText: string | null;
  validationSummary: ValidationSummary | null;
  ioBlockedUntil?: number | null;
  ioBlockedReason?: string | null;
  /** Audio session phase; used to ignore duplicate hold-end while stopping/settling. */
  audioSessionState?: 'idleReady' | 'starting' | 'listening' | 'stopping' | 'settling';
  /** Active recording session id when an STT session is in-flight; null otherwise. */
  recordingSessionId?: string | null;
  /** Set when the last request ended at the semantic front door (blocked); cleared on successful answer or recovery. */
  lastFrontDoorOutcome?: LastFrontDoorOutcome | null;
  metadata?: AgentStateMetadata;
}
