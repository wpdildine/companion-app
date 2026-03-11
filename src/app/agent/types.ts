/**
 * Agent architecture: normalized lifecycle and event contracts.
 * AgentOrchestrator owns runtime truth; VisualizationController consumes these.
 */

import type { ValidationSummary } from '../../rag';

/** Normalized agent lifecycle state. Provider-agnostic. */
export type AgentLifecycleState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

/** Processing substate: meaningful only when lifecycle === 'processing'; otherwise null. */
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

/** Normalized events emitted by AgentOrchestrator for VisualizationController. */
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
  onError?: () => void;
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
  metadata?: AgentStateMetadata;
}
