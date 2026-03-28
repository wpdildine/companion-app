/**
 * Native Voice / TTS adapter utilities. No lifecycle; orchestrator uses these for guards and fallbacks.
 */

import { NativeModules } from 'react-native';

export const NATIVE_RESTART_GUARD_MS = 250;

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

export function isRecognizerReentrancyError(message: string): boolean {
  return message.toLowerCase().includes('already started');
}

export function blockWindowUntil(now: number): number {
  return now + NATIVE_RESTART_GUARD_MS;
}

export function isRecoverableSpeechError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('no match') ||
    m.includes("didn't understand") ||
    m.includes('no speech') ||
    m.startsWith('7/') ||
    m.startsWith('11/')
  );
}

export function getVoiceNative(): {
  startSpeech?: (locale: string, opts?: object, cb?: (e?: string) => void) => void;
  stopSpeech?: (cb?: (e?: string) => void) => void;
} | null {
  const direct = (NativeModules?.Voice ?? null) as {
    startSpeech?: (locale: string, opts?: object, cb?: (e?: string) => void) => void;
    stopSpeech?: (cb?: (e?: string) => void) => void;
  } | null;
  const rct = (NativeModules?.RCTVoice ?? null) as {
    startSpeech?: (locale: string, opts?: object, cb?: (e?: string) => void) => void;
    stopSpeech?: (cb?: (e?: string) => void) => void;
  } | null;
  if (direct?.startSpeech || direct?.stopSpeech) return direct;
  if (rct?.startSpeech || rct?.stopSpeech) return rct;
  return direct ?? rct ?? null;
}

type VoiceModuleLike = { stop: () => Promise<void> } | null;

/**
 * Invokes native voice stop with fallback to getVoiceNative().stopSpeech when V.stop() throws
 * "stopspeech is null". Mechanism only; caller owns state (setAudioState, setNativeRestartGuardUntil).
 */
export async function invokeVoiceStop(
  V: VoiceModuleLike,
  getNative: () => ReturnType<typeof getVoiceNative>,
): Promise<void> {
  if (V) {
    try {
      await V.stop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const nativeVoice = getNative();
      if (
        msg.toLowerCase().includes('stopspeech is null') &&
        typeof nativeVoice?.stopSpeech === 'function'
      ) {
        try {
          // Callback-based native API; resolve on callback or after one tick to avoid hanging.
          await new Promise<void>(resolve => {
            let done = false;
            const finish = () => {
              if (!done) {
                done = true;
                resolve();
              }
            };
            nativeVoice.stopSpeech!(finish);
            setTimeout(finish, 0);
          });
        } catch {
          /* ignore */
        }
      } else {
        throw e;
      }
    }
  }
}

/** Minimal coordinator surface for native stop flow; avoids importing sessionCoordinator. */
export interface NativeStopFlowCoordinator {
  setIosStopPending: (v: boolean) => void;
  setIosStopInvoked: (v: boolean) => void;
}

/**
 * Runs the shared native stop sequence: set flags, invokeVoiceStop, then call onNativeStopComplete.
 * Caller (orchestrator) owns semantics and does setAudioState + setNativeRestartGuardUntil in onNativeStopComplete.
 */
export async function runNativeStopFlow(
  coordinator: NativeStopFlowCoordinator,
  V: VoiceModuleLike,
  getNative: () => ReturnType<typeof getVoiceNative>,
  _recordingSessionId: string | undefined,
  onNativeStopComplete: () => void,
): Promise<void> {
  coordinator.setIosStopPending(false);
  coordinator.setIosStopInvoked(true);
  await invokeVoiceStop(V, getNative);
  onNativeStopComplete();
}
