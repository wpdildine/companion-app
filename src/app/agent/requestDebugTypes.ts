/**
 * Request-scoped debug observability: event log and snapshot types.
 * See .cursor/plans/request-scoped_processing_observability_panel.plan.md.
 */

import type { ValidationSummary } from '../../rag';

/** Status of a request in the debug store. */
export type RequestDebugStatus = 'active' | 'completed' | 'failed';

/** Pack identity (orchestrator or RAG). */
export type RequestDebugPackIdentity = {
  packRoot?: string;
  embedModelId?: string;
  chatModelPath?: string;
};

/** Model and inference params. */
export type RequestDebugModelInfo = {
  modelPath?: string;
  modelId?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  [key: string]: unknown;
};

/** Derived durations (ms). */
export type RequestDebugDurations = {
  retrievalMs?: number;
  generationMs?: number;
  timeToFirstTokenMs?: number;
  ttsMs?: number;
  totalRequestMs?: number;
};

/** RAG retrieval summary. */
export type RequestDebugRetrievalSummary = {
  retrievalMode?: 'deterministic' | 'vector';
  contextLength?: number;
  bundleId?: string;
  ruleSetId?: string;
  bundlePreview?: string;
} | null;

/** RAG prompt assembly. */
export type RequestDebugPromptAssembly = {
  promptLength?: number;
  contextLength?: number;
  rulesCount?: number;
  cardsCount?: number;
  promptPreview?: string;
  promptHash?: string | null;
} | null;

/** RAG telemetry section on the snapshot. */
export type RequestDebugRagTelemetry = {
  retrievalSummary?: RequestDebugRetrievalSummary;
  promptAssembly?: RequestDebugPromptAssembly;
  generationRequest?: RequestDebugModelInfo | null;
  generationStats?: {
    finalLength?: number;
    totalTokens?: number;
    generationTimeMs?: number;
  } | null;
  initTrace?: Record<string, unknown> | null;
} | null;

/** Per-request snapshot (summary/read model). */
export interface RequestDebugSnapshot {
  requestId: number;
  status: RequestDebugStatus;
  acceptedTranscript: string;
  normalizedTranscript: string;
  requestStartedAt: number;
  retrievalStartedAt: number | null;
  retrievalEndedAt: number | null;
  packIdentity: RequestDebugPackIdentity | null;
  generationStartedAt: number | null;
  firstTokenAt: number | null;
  generationEndedAt: number | null;
  partialStream: string;
  finalSettledOutput: string | null;
  validationSummary: ValidationSummary | null;
  ttsStartedAt: number | null;
  ttsEndedAt: number | null;
  failureReason: string | null;
  lifecycle: string;
  completedAt?: number;
  eventsSeen?: number;
  modelInfo?: RequestDebugModelInfo | null;
  durations?: RequestDebugDurations | null;
  promptHash?: string | null;
  ragTelemetry?: RequestDebugRagTelemetry;
}

/** Event log entry (canonical timeline). */
export interface RequestDebugEvent {
  eventSeq: number;
  requestId: number | null;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

/** Payload for emit(): additive data merged into the snapshot. */
export type RequestDebugEmitPayload = Record<string, unknown> & {
  requestId: number | null;
};

/** Full store state (read-only view for consumers). */
export interface RequestDebugState {
  activeRequestId: number | null;
  recentRequestIds: number[];
  snapshotsById: Map<number, RequestDebugSnapshot>;
  events: RequestDebugEvent[];
  /** Last RAG init-phase telemetry (requestId null); optional for Pipeline panel. */
  lastRagInitTrace: Record<string, unknown> | null;
}

/** Max number of completed/failed requestIds to retain. */
export const REQUEST_DEBUG_RECENT_MAX = 10;
