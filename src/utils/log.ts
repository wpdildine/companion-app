/**
 * Structured logging for viz and touch. Pure; no React/theme imports.
 * Callers pass sessionId/slotIndex so tests can assert on output.
 */

const PREFIX_VIZ = '[Viz]';
const PREFIX_TOUCH = '[Touch]';

let verbose = false;

export function setLogVerbose(value: boolean): void {
  verbose = value;
}

export function logViz(
  message: string,
  payload?: { sessionId?: string; mode?: string; slotIndex?: number; [key: string]: unknown },
): void {
  const parts = [PREFIX_VIZ, message];
  if (payload && Object.keys(payload).length > 0) {
    parts.push(JSON.stringify(payload));
  }
  if (verbose || (payload && (payload.sessionId !== undefined || payload.slotIndex !== undefined))) {
    console.log(parts.join(' '));
  }
}

export function logTouch(
  message: string,
  payload?: { sessionId?: string; event?: string; [key: string]: unknown },
): void {
  const parts = [PREFIX_TOUCH, message];
  if (payload && Object.keys(payload).length > 0) {
    parts.push(JSON.stringify(payload));
  }
  if (verbose || (payload && payload.sessionId !== undefined)) {
    console.log(parts.join(' '));
  }
}

/** Mode change: must include sessionId for tests. */
export function logModeChange(mode: string, sessionId: string): void {
  logViz('mode', { mode, sessionId });
}

/** Pulse triggered: must include slotIndex for tests. */
export function logPulse(slotIndex: number, sessionId?: string): void {
  logViz('pulse', { slotIndex, sessionId });
}
