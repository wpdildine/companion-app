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

/** Voice tuning; applied via setOptions(), used by the next speak(). */
export type SpeakOptions = {
  noiseScale?: number;
  lengthScale?: number;
  noiseW?: number;
  gainDb?: number;
  /** Insert this many ms of silence between sentences (0 = off). E.g. 250 for a clear pause. */
  interSentenceSilenceMs?: number;
  /** Insert this many ms of silence after commas (0 = off). E.g. 125 for a short pause. */
  interCommaSilenceMs?: number;
};

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

  setOptions(options?: SpeakOptions | null): void {
    if (NativePiperTts == null) {
      throw new Error('PiperTts TurboModule not loaded. Rebuild the app (clean + pod install).');
    }
    if (options == null) return;
    console.log('[PiperTts] setOptions called', options);
    NativePiperTts.setOptions(options as Parameters<typeof NativePiperTts.setOptions>[0]);
  },

  async speak(text: string, _options?: SpeakOptions | null): Promise<void> {
    if (NativePiperTts == null) {
      emit({ type: 'error', message: MODULE_MISSING_MSG, data: { code: 'E_NOT_LINKED' } });
      return Promise.reject(new Error(MODULE_MISSING_MSG));
    }
    emit({ type: 'speak_start', data: { textLength: text.length } });
    try {
      await NativePiperTts.speak(text);
      emit({ type: 'speak_end' });
      /* Bubble native buffer/format diagnostics to JS console when available (iOS; Android does not implement getDebugInfo). */
      if (typeof NativePiperTts.getDebugInfo === 'function') {
        const debug = await NativePiperTts.getDebugInfo();
        if (debug && typeof debug === 'string') {
          const lastSection = debug.split('--- Last playback buffer check')[1];
          if (lastSection) {
            console.log('[PiperTts] Last playback buffer check' + lastSection.trim());
          }
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

  /** Copy Piper ONNX model from app assets to files/piper/ (Android). Call on startup so TTS works without waiting for first speak. */
  copyModelToFiles(): Promise<string | null> {
    if (NativePiperTts == null) return Promise.resolve(null);
    if (typeof (NativePiperTts as { copyModelToFiles?: () => Promise<string> }).copyModelToFiles !== 'function') {
      return Promise.resolve(null);
    }
    return (NativePiperTts as { copyModelToFiles: () => Promise<string> }).copyModelToFiles().catch(() => null);
  },

  isModelAvailable(): Promise<boolean> {
    if (NativePiperTts == null) return Promise.resolve(false);
    return NativePiperTts.isModelAvailable();
  },

  getDebugInfo(): Promise<string> {
    if (NativePiperTts == null) return Promise.resolve(MODULE_MISSING_MSG);
    if (typeof NativePiperTts.getDebugInfo !== 'function') {
      return Promise.resolve('getDebugInfo not implemented on this platform.');
    }
    return NativePiperTts.getDebugInfo().then((s: string | null) => s ?? MODULE_MISSING_MSG);
  },
};
