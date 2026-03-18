/**
 * [Perf] subsystem boundary logs when perf tracing is enabled (see isPerfTraceEnabled).
 */

import { logInfo } from '../../shared/logging';
import { isPerfTraceEnabled } from '../../shared/logging/perfTrace';

const lastWallByKey: Record<string, number> = {};

function keyFor(subsystem: string, phase: string): string {
  return `${subsystem}:${phase}`;
}

export function logVizSubsystemPerf(
  subsystem: string,
  phase: 'start' | 'end',
  requestId: number | undefined,
  extra?: Record<string, unknown>,
): void {
  if (!isPerfTraceEnabled()) return;
  const now = Date.now();
  const k = keyFor(subsystem, phase);
  const prev = lastWallByKey[k] ?? now;
  const elapsedMsSincePrev = now - prev;
  lastWallByKey[k] = now;
  logInfo('VisualizationRuntime', `[Perf] subsystem ${subsystem} ${phase}`, {
    requestId: requestId ?? undefined,
    elapsedMsSincePrev,
    ...extra,
  });
}
