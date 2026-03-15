/**
 * Thin telemetry helpers: readability only. No new semantics or policy.
 * Orchestrator and extracted modules call these instead of repeating sink/log patterns.
 */

import type { RequestDebugEmitPayload } from '../requestDebugTypes';

/** Ref to the request-debug sink (orchestrator passes requestDebugSinkRef). */
export type RequestDebugSinkRef = {
  current: ((payload: RequestDebugEmitPayload & { type: string }) => void) | null;
};

/**
 * Emit one request-debug payload. No-op if ref or current is null.
 */
export function emitRequestDebug(
  sinkRef: RequestDebugSinkRef | null | undefined,
  payload: RequestDebugEmitPayload & { type: string }
): void {
  sinkRef?.current?.(payload);
}
