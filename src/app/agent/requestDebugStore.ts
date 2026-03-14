/**
 * Request-debug store: canonical event log + snapshot map.
 * See .cursor/plans/request-scoped_processing_observability_panel.plan.md.
 */

import type { ValidationSummary } from '../../rag';
import type { ProcessingSubstate } from './types';
import type {
  RequestDebugEvent,
  RequestDebugSnapshot,
  RequestDebugState,
  RequestDebugEmitPayload,
  RequestDebugDurations,
  RequestDebugRagTelemetry,
} from './requestDebugTypes';
import { REQUEST_DEBUG_RECENT_MAX } from './requestDebugTypes';

/** Max partial_output events to keep per request in the event log (bounded subset). */
const MAX_PARTIAL_OUTPUT_EVENTS_PER_REQUEST = 25;

function createEmptySnapshot(requestId: number): RequestDebugSnapshot {
  return {
    requestId,
    status: 'active',
    acceptedTranscript: '',
    normalizedTranscript: '',
    requestStartedAt: 0,
    retrievalStartedAt: null,
    retrievalEndedAt: null,
    packIdentity: null,
    generationStartedAt: null,
    firstTokenAt: null,
    generationEndedAt: null,
    partialStream: '',
    finalSettledOutput: null,
    validationSummary: null,
    ttsStartedAt: null,
    ttsEndedAt: null,
    failureReason: null,
    lifecycle: 'idle',
  };
}

function deriveDurations(s: RequestDebugSnapshot): RequestDebugDurations | null {
  const d: RequestDebugDurations = {};
  if (s.retrievalStartedAt != null && s.retrievalEndedAt != null) {
    d.retrievalMs = s.retrievalEndedAt - s.retrievalStartedAt;
  }
  if (s.contextReadyAt != null && s.retrievalEndedAt != null) {
    d.contextPrepMs = s.contextReadyAt - s.retrievalEndedAt;
  }
  if (s.modelLoadStartAt != null && s.modelLoadEndAt != null) {
    d.modelLoadMs = s.modelLoadEndAt - s.modelLoadStartAt;
  }
  if (s.generationStartedAt != null && s.generationEndedAt != null) {
    d.generationMs = s.generationEndedAt - s.generationStartedAt;
  }
  if (s.generationStartedAt != null && s.firstTokenAt != null) {
    d.timeToFirstTokenMs = s.firstTokenAt - s.generationStartedAt;
  }
  const inferenceStartedAt = (s as unknown as Record<string, unknown>).inferenceStartedAt as
    | number
    | undefined;
  if (inferenceStartedAt != null && s.firstTokenAt != null) {
    d.timeToFirstTokenFromInferenceMs = s.firstTokenAt - inferenceStartedAt;
  }
  if (s.firstTokenAt != null && s.generationEndedAt != null) {
    d.streamingMs = s.generationEndedAt - s.firstTokenAt;
  }
  if (s.validationStartedAt != null && s.validationEndedAt != null) {
    d.validationMs = s.validationEndedAt - s.validationStartedAt;
  }
  if (s.settlingStartedAt != null && s.responseSettledAt != null) {
    d.settlingMs = s.responseSettledAt - s.settlingStartedAt;
  }
  if (s.ttsStartedAt != null && s.ttsEndedAt != null) {
    d.ttsMs = s.ttsEndedAt - s.ttsStartedAt;
  }
  if (s.completedAt != null && s.requestStartedAt != null) {
    d.totalRequestMs = s.completedAt - s.requestStartedAt;
  }
  return Object.keys(d).length > 0 ? d : null;
}

function mergeRagPayloadIntoSnapshot(
  snapshot: RequestDebugSnapshot,
  type: string,
  payload: Record<string, unknown>,
): void {
  const rt: NonNullable<RequestDebugRagTelemetry> = snapshot.ragTelemetry ?? {};
  snapshot.ragTelemetry = rt;
  if (type === 'rag_retrieval_start' || type === 'rag_retrieval_mode' || type === 'rag_context_bundle_selected' || type === 'rag_context_assembled' || type === 'rag_retrieval_complete') {
    rt.retrievalSummary = {
      ...rt.retrievalSummary,
      ...payload,
    } as NonNullable<RequestDebugRagTelemetry>['retrievalSummary'];
  }
  if (type === 'rag_prompt_built') {
    rt.promptAssembly = {
      ...rt.promptAssembly,
      ...payload,
    } as NonNullable<RequestDebugRagTelemetry>['promptAssembly'];
  }
  if (type === 'rag_generation_request_start') {
    rt.generationRequest = {
      ...rt.generationRequest,
      ...payload,
    } as NonNullable<RequestDebugRagTelemetry>['generationRequest'];
  }
  if (type === 'rag_generation_complete') {
    rt.generationStats = {
      ...rt.generationStats,
      ...payload,
    } as NonNullable<RequestDebugRagTelemetry>['generationStats'];
  }
  if (type === 'rag_generation_request_start') {
    (snapshot as unknown as Record<string, unknown>).modelInfo = {
      modelPath: payload.modelPath ?? rt.generationRequest?.modelPath,
      modelId: payload.modelId ?? rt.generationRequest?.modelId,
      temperature: payload.temperature ?? rt.generationRequest?.temperature,
      topP: payload.topP ?? rt.generationRequest?.topP,
      maxTokens: payload.maxTokens ?? rt.generationRequest?.maxTokens,
    };
  }
  if (type === 'rag_prompt_built' && payload.promptHash != null) {
    (snapshot as unknown as Record<string, unknown>).promptHash = payload.promptHash;
  }
  if (type === 'rag_retrieval_complete' && typeof payload.timestamp === 'number') {
    snapshot.contextReadyAt = payload.timestamp;
  }
  if (type === 'rag_model_load_start' && typeof payload.timestamp === 'number') {
    snapshot.modelLoadStartAt = payload.timestamp;
    if (typeof payload.cold === 'boolean') snapshot.modelLoadCold = payload.cold;
  }
  if (type === 'rag_model_load_end' && typeof payload.timestamp === 'number') {
    snapshot.modelLoadEndAt = payload.timestamp;
    if (typeof payload.cold === 'boolean') snapshot.modelLoadCold = payload.cold;
  }
  if (type === 'rag_inference_start' && typeof payload.timestamp === 'number') {
    snapshot.inferenceStartedAt = payload.timestamp;
  }
}

function mergePayloadIntoSnapshot(
  snapshot: RequestDebugSnapshot,
  type: string,
  payload: Record<string, unknown>,
): void {
  if (type.startsWith('rag_')) {
    mergeRagPayloadIntoSnapshot(snapshot, type, payload);
  } else {
    const rag = payload.ragTelemetry as RequestDebugRagTelemetry | undefined;
    if (rag != null) {
      snapshot.ragTelemetry = snapshot.ragTelemetry ?? {};
      if (rag.retrievalSummary != null) snapshot.ragTelemetry.retrievalSummary = rag.retrievalSummary;
      if (rag.promptAssembly != null) snapshot.ragTelemetry.promptAssembly = rag.promptAssembly;
      if (rag.generationRequest != null) snapshot.ragTelemetry.generationRequest = rag.generationRequest;
      if (rag.initTrace != null) snapshot.ragTelemetry.initTrace = rag.initTrace;
    }
    const skipKeys = new Set(['ragTelemetry', 'type', 'timestamp', 'requestId']);
    if (type === 'processing_substate' && payload.processingSubstate !== undefined) {
      snapshot.processingSubstate = payload.processingSubstate as ProcessingSubstate | null;
    }
    if (type === 'partial_output' && payload.accumulatedText !== undefined) {
      snapshot.partialStream = payload.accumulatedText as string;
    }
    if (type === 'response_settled') {
      if (payload.finalSettledOutput !== undefined) {
        snapshot.finalSettledOutput = payload.finalSettledOutput as string | null;
      }
      if (payload.validationSummary !== undefined) {
        snapshot.validationSummary = payload.validationSummary as ValidationSummary | null;
      }
      const ts = typeof payload.timestamp === 'number' ? payload.timestamp : undefined;
      if (ts != null) snapshot.responseSettledAt = ts;
    }
    if (type === 'validation_start' && typeof payload.timestamp === 'number') {
      snapshot.validationStartedAt = payload.timestamp;
    }
    if (type === 'validation_end' && typeof payload.timestamp === 'number') {
      snapshot.validationEndedAt = payload.timestamp;
    }
    if (type === 'settling_start' && typeof payload.timestamp === 'number') {
      snapshot.settlingStartedAt = payload.timestamp;
    }
    if (type === 'recoverable_failure') {
      snapshot.lastRecoverableFailureReason = (payload.reason as string) ?? null;
      snapshot.lastRecoverableFailureAt = typeof payload.timestamp === 'number' ? payload.timestamp : null;
    }
    for (const key of Object.keys(payload)) {
      if (skipKeys.has(key)) continue;
      const v = payload[key];
      if (v === undefined) continue;
      (snapshot as unknown as Record<string, unknown>)[key] = v;
    }
  }
  snapshot.eventsSeen = (snapshot.eventsSeen ?? 0) + 1;
  const durations = deriveDurations(snapshot);
  if (durations) snapshot.durations = durations;
}

let eventSeqCounter = 0;
const listeners = new Set<() => void>();

let activeRequestId: number | null = null;
let recentRequestIds: number[] = [];
const snapshotsById = new Map<number, RequestDebugSnapshot>();
const events: RequestDebugEvent[] = [];
let lastRagInitTrace: Record<string, unknown> | null = null;

function trimRetention(): void {
  while (recentRequestIds.length > REQUEST_DEBUG_RECENT_MAX) {
    const dropped = recentRequestIds.shift();
    if (dropped == null) break;
    snapshotsById.delete(dropped);
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].requestId === dropped) events.splice(i, 1);
    }
  }
}

/**
 * Emit a telemetry event: append to the event log, merge into the request snapshot, run retention, notify subscribers.
 */
export function emit(payload: RequestDebugEmitPayload & { type: string }): void {
  const requestId = payload.requestId ?? null;
  const event: RequestDebugEvent = {
    eventSeq: ++eventSeqCounter,
    requestId,
    type: payload.type,
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
    payload: { ...payload },
  };
  events.push(event);

  if (payload.type === 'partial_output' && requestId != null) {
    const partials = events.filter(e => e.requestId === requestId && e.type === 'partial_output');
    if (partials.length > MAX_PARTIAL_OUTPUT_EVENTS_PER_REQUEST) {
      const toRemove = partials.length - MAX_PARTIAL_OUTPUT_EVENTS_PER_REQUEST;
      let removed = 0;
      for (let i = 0; i < events.length && removed < toRemove; i++) {
        if (events[i].requestId === requestId && events[i].type === 'partial_output') {
          events.splice(i, 1);
          removed++;
          i--;
        }
      }
    }
  }

  if (requestId != null) {
    let snapshot = snapshotsById.get(requestId);
    if (snapshot == null) {
      snapshot = createEmptySnapshot(requestId);
      snapshotsById.set(requestId, snapshot);
    }
    mergePayloadIntoSnapshot(snapshot, event.type, event.payload);
  } else if (payload.type !== 'recoverable_failure') {
    const skip = new Set(['type', 'timestamp', 'requestId']);
    const add: Record<string, unknown> = { ...lastRagInitTrace };
    add[event.type] = event.timestamp;
    for (const k of Object.keys(event.payload)) {
      if (!skip.has(k)) add[k] = event.payload[k];
    }
    lastRagInitTrace = add;
  }

  switch (payload.type) {
    case 'request_start':
      if (requestId != null) activeRequestId = requestId;
      break;
    case 'request_complete':
    case 'request_failed':
    case 'request_canceled':
    case 'request_superseded':
      if (requestId != null) {
        if (activeRequestId === requestId) activeRequestId = null;
        if (!recentRequestIds.includes(requestId)) {
          recentRequestIds.push(requestId);
          trimRetention();
        }
      }
      break;
    default:
      break;
  }

  trimRetention();
  listeners.forEach((l) => l());
}

/**
 * Return current store state (read-only view). Consumers must not mutate the returned maps/arrays.
 */
export function getState(): RequestDebugState {
  return {
    activeRequestId,
    recentRequestIds: [...recentRequestIds],
    snapshotsById: new Map(snapshotsById),
    events: [...events],
    lastRagInitTrace: lastRagInitTrace ? { ...lastRagInitTrace } : null,
  };
}

/**
 * Subscribe to store updates (called after each emit). Returns an unsubscribe function.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
