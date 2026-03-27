/**
 * JS unification layer for plugin diagnostics.
 * Subscribes to all plugins, normalizes events, buffers last N, forwards to console.
 * See docs/plugin-contract.md.
 */

import type {
  NormalizedDiagnosticEvent,
  PluginEventPayload,
} from '../types/plugin-contract';

const DEFAULT_BUFFER_SIZE = 100;
let buffer: NormalizedDiagnosticEvent[] = [];
let bufferSize = DEFAULT_BUFFER_SIZE;
let installed = false;
const unsubscribes: Array<() => void> = [];
const GLOBAL_DIAGNOSTICS_KEY = '__COMPANION_PLUGIN_DIAGNOSTICS__';

type DiagnosticsGlobalState = {
  installed: boolean;
  uninstall?: () => void;
};

function getGlobalDiagnosticsState(): DiagnosticsGlobalState | null {
  if (typeof globalThis === 'undefined') return null;
  const host = globalThis as typeof globalThis & {
    __COMPANION_PLUGIN_DIAGNOSTICS__?: DiagnosticsGlobalState;
  };
  host[GLOBAL_DIAGNOSTICS_KEY] = host[GLOBAL_DIAGNOSTICS_KEY] ?? { installed: false };
  return host[GLOBAL_DIAGNOSTICS_KEY] ?? null;
}

function normalize(source: string, event: PluginEventPayload): NormalizedDiagnosticEvent {
  return {
    timestamp: Date.now(),
    source,
    type: event.type,
    message: event.message,
    data: event.data,
  };
}

function pushAndTrim(entry: NormalizedDiagnosticEvent, max: number): void {
  buffer.push(entry);
  if (buffer.length > max) buffer = buffer.slice(-max);
}

function toConsole(entry: NormalizedDiagnosticEvent): void {
  const prefix = `[${entry.source}] ${entry.type}`;
  const payload = entry.message ?? entry.data ?? '';
  if (entry.type === 'error') {
    console.warn(prefix, payload);
  } else {
    console.log(prefix, payload);
  }
}

function subscribeToPiperTts(): void {
  try {
    const PiperTts = require('piper-tts').default;
    if (typeof PiperTts.subscribe === 'function') {
      const unsub = PiperTts.subscribe((event: PluginEventPayload) => {
        const entry = normalize('PiperTts', event);
        pushAndTrim(entry, bufferSize);
        toConsole(entry);
      });
      unsubscribes.push(unsub);
    }
  } catch (_) {
    // Plugin not available; skip
  }
}

function subscribeToAtlasNativeMic(): void {
  try {
    const AtlasNativeMic = require('atlas-native-mic').default;
    if (typeof AtlasNativeMic.subscribeAsPlugin === 'function') {
      const unsub = AtlasNativeMic.subscribeAsPlugin((event: PluginEventPayload) => {
        const entry = normalize('AtlasNativeMic', event);
        pushAndTrim(entry, bufferSize);
        toConsole(entry);
      });
      unsubscribes.push(unsub);
    }
  } catch (_) {
    // Plugin not available; skip
  }
}

/**
 * Start the diagnostics layer: subscribe to all plugins, buffer events, log to console.
 * Safe to call multiple times; subsequent calls no-op.
 */
export function install(options?: { bufferSize?: number }): void {
  const globalState = getGlobalDiagnosticsState();
  if (installed || globalState?.installed) return;
  installed = true;
  bufferSize = options?.bufferSize ?? DEFAULT_BUFFER_SIZE;
  buffer = [];
  if (globalState) {
    globalState.installed = true;
    globalState.uninstall = uninstall;
  }

  subscribeToPiperTts();
  subscribeToAtlasNativeMic();
  // Add more plugins here as they expose subscribe(callback).
}

/**
 * Stop receiving and clear buffer. Useful for tests.
 */
export function uninstall(): void {
  for (const unsub of unsubscribes) unsub();
  unsubscribes.length = 0;
  buffer = [];
  installed = false;
  const globalState = getGlobalDiagnosticsState();
  if (globalState) {
    globalState.installed = false;
    globalState.uninstall = uninstall;
  }
}

/**
 * Get the last N normalized events (e.g. for debug UI or Sentry breadcrumbs).
 */
export function getRecentEvents(count?: number): NormalizedDiagnosticEvent[] {
  const n = count ?? buffer.length;
  return buffer.slice(-n);
}
