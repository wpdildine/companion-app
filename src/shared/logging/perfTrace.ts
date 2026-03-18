/**
 * Sparse, high-signal performance trace. Used for latency attribution only.
 * Each trace logs: timestamp, elapsed since previous milestone, elapsed since request start (if request-scoped),
 * and requestId/recordingSessionId when available.
 * Also pushes to a shared in-memory ring buffer for frame-gap attribution (starvation detector).
 * Do not use in per-frame or hot paths; starvation detector uses its own guarded log.
 */

import { logInfo, type LogScope, type LogDetails } from './logger';
import {
  getPerfBufferInstanceId,
  getPerfMilestoneBufferDebugState,
  pushPerfMilestone,
} from './perfMilestoneBuffer';

let lastMilestoneTime = 0;
let requestStartTime: number | null = null;
let perfBufferWriterInstanceLogged = false;
let perfBufferPushDebugCount = 0;
const PERF_BUFFER_PUSH_DEBUG_MAX = 5;

/**
 * When false, perfTrace is a no-op (no logs, no milestone buffer writes).
 * Default: on in __DEV__. In release, set `globalThis.__ATLAS_PERF_TRACE__ = true` to enable.
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

  if (perfBufferPushDebugCount < PERF_BUFFER_PUSH_DEBUG_MAX) {
    perfBufferPushDebugCount++;
    const debugState = getPerfMilestoneBufferDebugState();
    logInfo('Runtime', 'perf buffer push debug', {
      instanceId: debugState.instanceId,
      count: debugState.count,
      writeIndex: debugState.writeIndex,
      capacity: debugState.capacity,
      pushedMilestone: milestone,
      pushedTimestamp: now,
    });
  }
}

/** Clear request-scoped timing (e.g. on reset). */
export function clearRequestTiming(): void {
  requestStartTime = null;
}
