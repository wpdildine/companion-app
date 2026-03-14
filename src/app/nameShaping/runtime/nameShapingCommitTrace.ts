/**
 * Experimental commit-trace scaffold for Name Shaping perf investigation.
 * Paused by default while active Name Shaping development is on hold.
 *
 * TODO(nameshaping-resume): Re-enable this trace only when resuming Android
 * commit-path profiling. Keep it out of the normal MTG assistant path.
 */

import { logInfo } from '../../../shared/logging';
import type { NormalizedNameShapingSignature } from '../foundation/nameShapingTypes';

const NAME_SHAPING_COMMIT_TRACE_ENABLED = false;

type CommitTrace = {
  id: number;
  signature: NormalizedNameShapingSignature;
  startedAtMs: number;
};

let nextCommitTraceId = 1;
let activeCommitTrace: CommitTrace | null = null;

function nowMs(): number {
  return Date.now();
}

function signatureEquals(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function beginNameShapingCommitTrace(
  signature: NormalizedNameShapingSignature,
): number | null {
  if (!NAME_SHAPING_COMMIT_TRACE_ENABLED) return null;
  const id = nextCommitTraceId;
  nextCommitTraceId += 1;
  activeCommitTrace = {
    id,
    signature: [...signature],
    startedAtMs: nowMs(),
  };
  logInfo('AgentSurface', 'NameShaping commit trace start', {
    traceId: id,
    signatureLength: signature.length,
    signature: [...signature],
  });
  return id;
}

export function getActiveNameShapingCommitTrace(
  signature: NormalizedNameShapingSignature,
): { id: number; elapsedMs: number } | null {
  if (!NAME_SHAPING_COMMIT_TRACE_ENABLED) return null;
  if (activeCommitTrace == null) return null;
  if (!signatureEquals(activeCommitTrace.signature, signature)) return null;
  return {
    id: activeCommitTrace.id,
    elapsedMs: Math.round((nowMs() - activeCommitTrace.startedAtMs) * 1000) / 1000,
  };
}

export function endNameShapingCommitTrace(
  traceId: number,
): void {
  if (!NAME_SHAPING_COMMIT_TRACE_ENABLED) return;
  if (activeCommitTrace?.id !== traceId) return;
  activeCommitTrace = null;
}
