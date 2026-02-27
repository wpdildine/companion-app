/**
 * Shared contract types for native plugins.
 * See docs/plugin-contract.md.
 */

/** Structured error from a plugin: stable code + message + optional details. */
export interface PluginError<T extends string = string> {
  code: T;
  message: string;
  details?: Record<string, unknown>;
}

/** Standard event payload emitted by plugins (progress, warnings, completion). */
export interface PluginEventPayload {
  type: string;
  message?: string;
  data?: Record<string, unknown>;
}

/** Normalized event stored and forwarded by PluginDiagnostics. */
export interface NormalizedDiagnosticEvent {
  timestamp: number;
  source: string;
  type: string;
  message?: string;
  data?: Record<string, unknown>;
}

/** Helper: normalize a native rejection (code, message, details?) into PluginError. */
export function toPluginError<T extends string = string>(
  code: string,
  message: string,
  details?: Record<string, unknown> | null
): PluginError<T> {
  return { code: code as T, message, details: details ?? undefined };
}
