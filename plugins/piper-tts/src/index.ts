/**
 * Piper TTS: TurboModule (New Arch) with legacy fallback.
 * Follows plugin contract: structured errors, events, getDebugInfo.
 */
import NativePiperTts from './NativePiperTts';
import type { PluginEventPayload } from '../../../src/types/plugin-contract';

const MODULE_MISSING_MSG =
  'Native module PiperTts is not loaded. Rebuild the app (clean + pod install) and ensure the Piper TTS pod is linked.';

const SOURCE_NAME = 'PiperTts';

type EventListener = (event: PluginEventPayload) => void;
const listeners: EventListener[] = [];

function emit(event: PluginEventPayload): void {
  for (const cb of listeners) {
    try {
      cb(event);
    } catch (_) {
      // Never crash the JS thread (contract rule 1)
    }
  }
}

export type { PiperErrorCode, PiperPluginError } from './errors';
export { toPiperError } from './errors';

/** Subscribe to Piper TTS events (speak_start, speak_end, error). Returns unsubscribe. */
export function subscribe(callback: EventListener): () => void {
  listeners.push(callback);
  return () => {
    const i = listeners.indexOf(callback);
    if (i !== -1) listeners.splice(i, 1);
  };
}

export default {
  subscribe,

  async speak(text: string): Promise<void> {
    if (NativePiperTts == null) {
      emit({ type: 'error', message: MODULE_MISSING_MSG, data: { code: 'E_NOT_LINKED' } });
      return Promise.reject(new Error(MODULE_MISSING_MSG));
    }
    emit({ type: 'speak_start', data: { textLength: text.length } });
    try {
      await NativePiperTts.speak(text);
      emit({ type: 'speak_end' });
      /* Bubble native buffer/format diagnostics to JS console (no Xcode needed). */
      const debug = await NativePiperTts.getDebugInfo();
      if (debug && typeof debug === 'string') {
        const lastSection = debug.split('--- Last playback buffer check')[1];
        if (lastSection) {
          console.log('[PiperTts] Last playback buffer check' + lastSection.trim());
        }
      }
    } catch (e) {
      const err = e as { code?: string; message?: string };
      emit({
        type: 'error',
        message: err?.message ?? String(e),
        data: { code: err?.code ?? 'E_INTERNAL' },
      });
      throw e;
    }
  },

  isModelAvailable(): Promise<boolean> {
    if (NativePiperTts == null) return Promise.resolve(false);
    return NativePiperTts.isModelAvailable();
  },

  getDebugInfo(): Promise<string> {
    if (NativePiperTts == null) return Promise.resolve(MODULE_MISSING_MSG);
    return NativePiperTts.getDebugInfo().then((s: string | null) => s ?? MODULE_MISSING_MSG);
  },
};
