/**
 * Request-scoped debug observability: event log and snapshot types.
 * See .cursor/plans/request-scoped_processing_observability_panel.plan.md.
 *
 * Transcript-clipping observability (speech stop requested, native stop completed, transcript settled,
 * tail-grace marker) is deferred to a later speech-pipeline pass; not request-scoped here.
 */

import type { ValidationSummary } from '../../rag';
import type { ProcessingSubstate } from './types';

/** Request outcome for telemetry: active, terminal success (completed), or terminal error (failed). Not a lifecycle value. */
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

/** Derived durations (ms). Fixed formulas per Runtime Truth and Measurement Audit plan. */
export type RequestDebugDurations = {
  retrievalMs?: number;
  contextPrepMs?: number;
  modelLoadMs?: number;
  generationMs?: number;
  /** TTFT from ask start (generation_start). Label in UI as "TTFT (from ask start)". */
  timeToFirstTokenMs?: number;
  /** TTFT from inference start, only when RAG provides inferenceStartedAt. Label in UI as "TTFT (from inference start)". */
  timeToFirstTokenFromInferenceMs?: number;
  streamingMs?: number;
  validationMs?: number;
  settlingMs?: number;
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
  /** Canonical lifecycle from orchestrator events: idle | listening | processing | speaking | error. Not request outcome. */
  lifecycle: string;
  /** Orchestrator processing substate when lifecycle is processing. */
  processingSubstate?: ProcessingSubstate | null;
  completedAt?: number;
  eventsSeen?: number;
  modelInfo?: RequestDebugModelInfo | null;
  durations?: RequestDebugDurations | null;
  promptHash?: string | null;
  ragTelemetry?: RequestDebugRagTelemetry;
  validationStartedAt?: number | null;
  validationEndedAt?: number | null;
  settlingStartedAt?: number | null;
  responseSettledAt?: number | null;
  modelLoadStartAt?: number | null;
  modelLoadEndAt?: number | null;
  modelLoadCold?: boolean | null;
  inferenceStartedAt?: number | null;
  /** Debug-only; for Android vs iOS comparison. Not durable orchestrator state. */
  platform?: 'ios' | 'android';
  /** Observational only: last recoverable failure (non-terminal). Not a lifecycle or status. */
  lastRecoverableFailureReason?: string | null;
  lastRecoverableFailureAt?: number | null;
  /** Set from rag_retrieval_complete for contextPrepMs derivation. */
  contextReadyAt?: number | null;
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
