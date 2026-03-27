/**
 * Atlas native microphone: hardware/session facts only (NATIVE_MIC_CONTRACT).
 * Follows PLUGIN_CONTRACT: structured errors, events, getDebugInfo.
 */
import {
  NativeEventEmitter,
  NativeModules,
  type NativeModule,
} from 'react-native';
import type { PluginEventPayload } from '../../../src/shared/types/plugin-contract';
import {
  MIC_EVENT_TYPES,
  type MicEventPayload,
  type MicSessionPhase,
  type StopFinalizeResult,
} from './contract';

const MODULE_MISSING_MSG =
  'Native module AtlasNativeMic is not loaded. Rebuild the app (pod install / gradle).';

type EventListener = (event: MicEventPayload) => void;
const listeners: EventListener[] = [];

function emitToListeners(event: MicEventPayload): void {
  for (const cb of listeners) {
    try {
      cb(event);
    } catch {
      // Never crash JS thread (PLUGIN_CONTRACT rule 1)
    }
  }
}

function getNative(): {
  init?: () => Promise<void>;
  startCapture?: (sessionId: string) => Promise<void>;
  stopFinalize?: (sessionId: string) => Promise<StopFinalizeResult>;
  cancel?: (sessionId: string) => Promise<void>;
  teardown?: () => Promise<void>;
  getDebugInfo?: () => Promise<string>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
} | null {
  const m = NativeModules.AtlasNativeMic as typeof NativeModules.AtlasNativeMic | undefined;
  return m ?? null;
}

let eventEmitter: NativeEventEmitter | null = null;
let nativeEventsWired = false;

function ensureEventSubscription(): void {
  if (nativeEventsWired) return;
  const native = getNative();
  if (!native) return;
  eventEmitter = new NativeEventEmitter(native as NativeModule);
  const types = Object.values(MIC_EVENT_TYPES);
  for (const t of types) {
    eventEmitter.addListener(t, (raw: Record<string, unknown>) => {
      const sessionId =
        typeof raw.sessionId === 'string' ? raw.sessionId : '';
      const phaseRaw = typeof raw.phase === 'string' ? raw.phase : 'idle';
      const phase = phaseRaw as MicSessionPhase;
      const payload: MicEventPayload = {
        type: t as MicEventPayload['type'],
        message: typeof raw.message === 'string' ? raw.message : undefined,
        data: {
          sessionId,
          phase,
          stale: raw.stale === true,
          code: typeof raw.code === 'string' ? raw.code : undefined,
          classification:
            raw.classification === 'hardware_session' ||
            raw.classification === 'transport' ||
            raw.classification === 'interruption'
              ? raw.classification
              : undefined,
        },
      };
      emitToListeners(payload);
    });
  }
  nativeEventsWired = true;
}

/** Subscribe to normalized mic events (also forwards to PluginDiagnostics if installed). */
export function subscribe(callback: EventListener): () => void {
  ensureEventSubscription();
  listeners.push(callback);
  return () => {
    const i = listeners.indexOf(callback);
    if (i !== -1) listeners.splice(i, 1);
  };
}

/** Map mic events to shared PluginEventPayload for diagnostics. */
function toPluginPayload(e: MicEventPayload): PluginEventPayload {
  return {
    type: e.type,
    message: e.message,
    data: e.data as Record<string, unknown> | undefined,
  };
}

export { MIC_EVENT_TYPES };
export type { MicEventPayload, StopFinalizeResult };

export default {
  subscribe,

  async init(): Promise<void> {
    const n = getNative();
    if (!n?.init) throw new Error(MODULE_MISSING_MSG);
    await n.init();
  },

  async startCapture(sessionId: string): Promise<void> {
    const n = getNative();
    if (!n?.startCapture) throw new Error(MODULE_MISSING_MSG);
    if (!sessionId?.trim()) {
      throw Object.assign(new Error('sessionId required'), { code: 'E_INVALID' });
    }
    await n.startCapture(sessionId);
  },

  async stopFinalize(sessionId: string): Promise<StopFinalizeResult> {
    const n = getNative();
    if (!n?.stopFinalize) throw new Error(MODULE_MISSING_MSG);
    const r = await n.stopFinalize(sessionId);
    if (r && typeof r === 'object' && 'duplicate' in r && r.duplicate) {
      return {
        uri: '',
        durationMillis: 0,
        duplicate: true,
      };
    }
    const uri = typeof r?.uri === 'string' ? r.uri : '';
    const durationMillis =
      typeof r?.durationMillis === 'number' ? r.durationMillis : 0;
    return { uri, durationMillis, duplicate: !!r?.duplicate };
  },

  async cancel(sessionId: string): Promise<void> {
    const n = getNative();
    if (!n?.cancel) throw new Error(MODULE_MISSING_MSG);
    await n.cancel(sessionId);
  },

  async teardown(): Promise<void> {
    const n = getNative();
    if (!n?.teardown) throw new Error(MODULE_MISSING_MSG);
    await n.teardown();
  },

  async getDebugInfo(): Promise<string> {
    const n = getNative();
    if (!n?.getDebugInfo) return MODULE_MISSING_MSG;
    try {
      const s = await n.getDebugInfo();
      return typeof s === 'string' ? s : JSON.stringify(s);
    } catch {
      return MODULE_MISSING_MSG;
    }
  },

  /** For PluginDiagnostics: normalized plugin shape. */
  subscribeAsPlugin(callback: (e: PluginEventPayload) => void): () => void {
    return subscribe(e => callback(toPluginPayload(e)));
  },

  isAvailable(): boolean {
    return getNative()?.startCapture != null;
  },
};
