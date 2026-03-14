/**
 * Uniform app-wide logging for observable lifecycle and ownership verification.
 *
 * Logging policy:
 * - Logging is for observable lifecycle and ownership verification.
 * - Do not log inside frame loops or render paths.
 * - New or touched architecture/runtime logs should use this logger; untouched paths may remain as-is.
 * - Lifecycle logs must be state-change based.
 * - Legacy/deprecation logs fire once only.
 * - When requestId/recordingSessionId are present, include them in details under stable keys (requestId, recordingSessionId).
 */

export type LogScope =
  | 'AgentOrchestrator'
  | 'AgentSurface'
  | 'Visualization'
  | 'VisualizationController'
  | 'VisualizationRuntime'
  | 'ResultsOverlay'
  | 'ResponseSurface'
  | 'VoiceScreen'
  | 'Runtime'
  | 'RAG'
  | 'Playback'
  | 'Interaction'
  | 'NameShapingCapture'
  | 'AppBoot';

export type LogDetails = Record<string, unknown> & {
  requestId?: number;
  recordingSessionId?: string;
};

const enabled = typeof __DEV__ !== 'undefined' ? __DEV__ : true;
const scopeFilter =
  typeof globalThis !== 'undefined' && (globalThis as { __LOG_SCOPES__?: string[] | string }).__LOG_SCOPES__;

function isScopeEnabled(scope: LogScope): boolean {
  if (!scopeFilter) return true;
  const allow = Array.isArray(scopeFilter)
    ? scopeFilter
    : scopeFilter
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
  return allow.includes(scope);
}

function formatLine(scope: LogScope, message: string, details?: LogDetails): string {
  const prefix = `[${scope}]`;
  if (details == null || Object.keys(details).length === 0) {
    return `${prefix} ${message}`;
  }
  try {
    return `${prefix} ${message} ${JSON.stringify(details)}`;
  } catch {
    return `${prefix} ${message}`;
  }
}

function write(level: 'info' | 'warn' | 'error', scope: LogScope, message: string, details?: LogDetails): void {
  if (!enabled) return;
  if (!isScopeEnabled(scope)) return;
  const line = formatLine(scope, message, details);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(scope: LogScope, message: string, details?: LogDetails): void {
  write('info', scope, message, details);
}

export function logWarn(scope: LogScope, message: string, details?: LogDetails): void {
  write('warn', scope, message, details);
}

export function logError(scope: LogScope, message: string, details?: LogDetails): void {
  write('error', scope, message, details);
}

export function logLifecycle(scope: LogScope, event: string, details?: LogDetails): void {
  if (!enabled) return;
  if (!isScopeEnabled(scope)) return;
  const line = formatLine(scope, event, details);
  console.log(line);
}
