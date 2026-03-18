/**
 * Native Voice / TTS adapter utilities. No lifecycle; orchestrator uses these for guards and fallbacks.
 */

import { NativeModules } from 'react-native';
import { BUNDLE_PACK_ROOT } from '../../../rag';
import { logInfo } from '../../../shared/logging';

export const NATIVE_RESTART_GUARD_MS = 250;

const BUNDLE_MODEL_PREFIXES = Array.from(
  new Set([BUNDLE_PACK_ROOT, '', 'content_pack'].filter(Boolean)),
);
const BUNDLE_EMBED_PATH_CANDIDATES = BUNDLE_MODEL_PREFIXES.map(
  (prefix: string) => `${prefix}/models/embed/embed.gguf`,
);
const BUNDLE_LLM_PATH_CANDIDATES = BUNDLE_MODEL_PREFIXES.map(
  (prefix: string) => `${prefix}/models/llm/model.gguf`,
);
const EMBED_MODEL_FILENAME = 'nomic-embed-text.gguf';
const CHAT_MODEL_FILENAME = 'model.gguf';

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
  getNative: () => ReturnType<typeof getVoiceNative>
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
          await new Promise<void>((resolve) => {
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
  onNativeStopComplete: () => void
): Promise<void> {
  coordinator.setIosStopPending(false);
  coordinator.setIosStopInvoked(true);
  await invokeVoiceStop(V, getNative);
  onNativeStopComplete();
}

export async function getOnDeviceModelPaths(
  packRootInDocuments?: string
): Promise<{ embedModelPath: string; chatModelPath: string }> {
  const RagPackReader =
    NativeModules.RagPackReader ?? NativeModules.RagPackReaderModule;
  if (!RagPackReader) return { embedModelPath: '', chatModelPath: '' };

  let embedModelPath = '';
  let chatModelPath = '';
  let modelsDir = '';
  let embedLocation: 'documents' | 'bundle' | 'app-models' | undefined;
  let chatLocation: 'documents' | 'bundle' | 'app-models' | undefined;

  const fileExists = async (absolutePath: string): Promise<boolean> => {
    if (!absolutePath || typeof absolutePath !== 'string') return false;
    if (typeof RagPackReader.fileExistsAtPath !== 'function') return true;
    try {
      return !!(await RagPackReader.fileExistsAtPath(absolutePath));
    } catch {
      return false;
    }
  };

  const resolveBundleModelPath = async (candidates: string[]): Promise<string> => {
    if (typeof RagPackReader.getBundleFilePath !== 'function') return '';
    for (const candidate of candidates) {
      try {
        const resolved = await RagPackReader.getBundleFilePath(candidate);
        if (resolved && (await fileExists(resolved))) return resolved;
      } catch {
        /* try next */
      }
    }
    return '';
  };

  if (packRootInDocuments?.trim()) {
    const root = packRootInDocuments.replace(/\/+$/, '');
    if (typeof RagPackReader.readFileAtPath === 'function') {
      try {
        const manifestJson = await RagPackReader.readFileAtPath(`${root}/manifest.json`);
        const manifest = JSON.parse(manifestJson) as {
          models?: { llm?: { file?: string }; embed?: { file?: string } };
        };
        const llmFile = manifest?.models?.llm?.file;
        const embedFile = manifest?.models?.embed?.file;
        if (llmFile && (await fileExists(`${root}/${llmFile}`))) {
          chatModelPath = `${root}/${llmFile}`;
          chatLocation = 'documents';
        }
        if (embedFile && (await fileExists(`${root}/${embedFile}`))) {
          embedModelPath = `${root}/${embedFile}`;
          embedLocation = 'documents';
        }
      } catch {
        /* use fallbacks */
      }
    }
    const packEmbed = `${root}/models/embed/embed.gguf`;
    const packLlm = `${root}/models/llm/model.gguf`;
    if (!embedModelPath && (await fileExists(packEmbed))) {
      embedModelPath = packEmbed;
      embedLocation = 'documents';
    }
    if (!chatModelPath && (await fileExists(packLlm))) {
      chatModelPath = packLlm;
      chatLocation = 'documents';
    }
  }

  if (!embedModelPath || !chatModelPath) {
    try {
      const [embedPath, llmPath] = await Promise.all([
        resolveBundleModelPath(BUNDLE_EMBED_PATH_CANDIDATES),
        resolveBundleModelPath(BUNDLE_LLM_PATH_CANDIDATES),
      ]);
      if (embedPath && !embedModelPath) {
        embedModelPath = embedPath;
        embedLocation = 'bundle';
      }
      if (llmPath && !chatModelPath) {
        chatModelPath = llmPath;
        chatLocation = 'bundle';
      }
    } catch {
      /* bundle not available */
    }
  }

  if (!embedModelPath || !chatModelPath) {
    try {
      if (RagPackReader.getAppModelsPath) {
        modelsDir = await RagPackReader.getAppModelsPath();
        if (modelsDir && typeof modelsDir === 'string') {
          const dir = modelsDir.replace(/\/+$/, '');
          if (!embedModelPath && (await fileExists(`${dir}/${EMBED_MODEL_FILENAME}`))) {
            embedModelPath = `${dir}/${EMBED_MODEL_FILENAME}`;
            embedLocation = 'app-models';
          }
          if (!chatModelPath && (await fileExists(`${dir}/${CHAT_MODEL_FILENAME}`))) {
            chatModelPath = `${dir}/${CHAT_MODEL_FILENAME}`;
            chatLocation = 'app-models';
          }
        }
      }
    } catch {
      /* app models path not available */
    }
  }

  if (embedModelPath || chatModelPath) {
    logInfo('Runtime', 'Model paths', { embed: embedModelPath || null, chat: chatModelPath || null });
  }

  // Diagnostics: resolved path, exists, location (size requires native helper; omit for now)
  if (embedModelPath) {
    const exists = await fileExists(embedModelPath);
    logInfo('Runtime', 'model path resolved', {
      kind: 'embed',
      path: embedModelPath,
      exists,
      sizeBytes: undefined,
      location: embedLocation ?? undefined,
    });
  }
  if (chatModelPath) {
    const exists = await fileExists(chatModelPath);
    logInfo('Runtime', 'model path resolved', {
      kind: 'chat',
      path: chatModelPath,
      exists,
      sizeBytes: undefined,
      location: chatLocation ?? undefined,
    });
  }

  return { embedModelPath, chatModelPath };
}
