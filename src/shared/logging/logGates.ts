/**
 * DEV-only runtime log gates. Read at call time from globalThis.__ATLAS_LOG_GATES__.
 * When a gate is false, the corresponding log/debug emit is skipped.
 */

export type AtlasLogGate =
  | 'settlementPayload'
  | 'playbackHandoff'
  | 'requestDebug'
  | 'ragVerbose'
  | 'vizRuntime';

export function isLogGateEnabled(gate: AtlasLogGate): boolean {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return true;
  const gates = (globalThis as Record<string, unknown>).__ATLAS_LOG_GATES__ as
    | Record<string, boolean>
    | undefined;
  return gates?.[gate] !== false;
}
