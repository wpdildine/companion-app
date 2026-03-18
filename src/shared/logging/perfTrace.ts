/**
 * Sparse performance milestones for latency attribution. When enabled: logs + ring buffer for frame-gap tools.
 * Ownership (typical): AgentOrchestrator (request/voice), RemoteSTT/OpenAIProxy (STT transport), RAG (retrieval/generation),
 * VisualizationRuntime (viz tick layers), Interaction (gesture). Prefer scope matching the owning module.
 * Do not use in per-frame steady state; viz layers log at most once per skip/run edge.
 * When disabled: no logs or buffer writes; requestStartTime/requestEnd in details still update internal request timing.
 */

import { logInfo, type LogScope, type LogDetails } from './logger';
import {
  getPerfBufferInstanceId,
  pushPerfMilestone,
} from './perfMilestoneBuffer';

let lastMilestoneTime = 0;
let requestStartTime: number | null = null;
let perfBufferWriterInstanceLogged = false;

/**
 * When false: no logs or buffer pushes. Default on in __DEV__; release: `globalThis.__ATLAS_PERF_TRACE__ === true`.
 */
export function isPerfTraceEnabled(): boolean {
  const g = globalThis as typeof globalThis & { __ATLAS_PERF_TRACE__?: boolean };
  if (g.__ATLAS_PERF_TRACE__ === true) return true;
  if (g.__ATLAS_PERF_TRACE__ === false) return false;
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export interface PerfTraceDetails extends LogDetails {
  /** Set when tracing "request started" so subsequent traces get elapsedMsSinceRequest. */
  requestStartTime?: number;
  /** Set when tracing "request complete" or "request failed" to clear request-scoped timing. */
  requestEnd?: boolean;
}

/**
 * Emit a performance milestone. Logs timestamp, elapsed since previous milestone,
 * and (if a request is in progress) elapsed since request start.
 * When details.requestStartTime is set, starts request-scoped timing.
 * When details.requestEnd is true, clears request-scoped timing.
 */
export function perfTrace(
  scope: LogScope,
  milestone: string,
  details?: PerfTraceDetails,
): void {
  if (!isPerfTraceEnabled()) {
    if (details?.requestStartTime != null) {
      requestStartTime = details.requestStartTime;
    }
    if (details?.requestEnd === true) {
      requestStartTime = null;
    }
    return;
  }
  const now = Date.now();
  const elapsedMsSincePrev = lastMilestoneTime > 0 ? now - lastMilestoneTime : 0;
  lastMilestoneTime = now;

  if (details?.requestStartTime != null) {
    requestStartTime = details.requestStartTime;
  }
  if (details?.requestEnd === true) {
    requestStartTime = null;
  }

  const payload: LogDetails = {
    ...details,
    milestone,
    timestamp: now,
    elapsedMsSincePrev,
  };
  if (requestStartTime != null) {
    payload.elapsedMsSinceRequest = now - requestStartTime;
  }
  delete (payload as PerfTraceDetails).requestStartTime;
  delete (payload as PerfTraceDetails).requestEnd;

  logInfo(scope, `[Perf] ${milestone}`, payload);

  if (!perfBufferWriterInstanceLogged) {
    perfBufferWriterInstanceLogged = true;
    logInfo('Runtime', 'perf buffer writer instance', {
      instanceId: getPerfBufferInstanceId(),
    });
  }

  const requestId = details && typeof (details as LogDetails).requestId === 'number' ? (details as LogDetails).requestId : undefined;
  pushPerfMilestone({ name: milestone, timestamp: now, scope, requestId });
}

/** Clear request-scoped timing (e.g. on reset). */
export function clearRequestTiming(): void {
  requestStartTime = null;
}
