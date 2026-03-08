/**
 * Agent architecture: normalized lifecycle and event contracts.
 * AgentOrchestrator owns runtime truth; VisualizationController consumes these.
 */

import type { ValidationSummary } from '../../rag';

/** Normalized agent lifecycle state. Provider-agnostic. */
export type AgentLifecycleState =
  | 'idle'
  | 'listening'
  | 'retrieving'
  | 'thinking'
  | 'speaking'
  | 'complete'
  | 'failed'
  | 'error';

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
  onError?: () => void;
}

/** State emitted by AgentOrchestrator. Single source of truth for agent runtime. */
export interface AgentOrchestratorState {
  lifecycle: AgentLifecycleState;
  error: string | null;
  voiceReady: boolean;
  transcribedText: string;
  responseText: string | null;
  validationSummary: ValidationSummary | null;
  ioBlockedUntil?: number | null;
  ioBlockedReason?: string | null;
  metadata?: AgentStateMetadata;
}
