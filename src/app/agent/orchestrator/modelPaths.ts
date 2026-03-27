import { NativeModules } from 'react-native';
import { BUNDLE_PACK_ROOT } from '../../../rag';
import { logInfo } from '../../../shared/logging';

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

export async function getOnDeviceModelPaths(
  packRootInDocuments?: string,
): Promise<{ embedModelPath: string; chatModelPath: string }> {
  const RagPackReader =
    NativeModules.RagPackReader ?? NativeModules.RagPackReaderModule;
  if (!RagPackReader) return { embedModelPath: '', chatModelPath: '' };

  let embedModelPath = '';
  let chatModelPath = '';
  let modelsDir = '';

  const fileExists = async (absolutePath: string): Promise<boolean> => {
    if (!absolutePath || typeof absolutePath !== 'string') return false;
    if (typeof RagPackReader.fileExistsAtPath !== 'function') return true;
    try {
      return !!(await RagPackReader.fileExistsAtPath(absolutePath));
    } catch {
      return false;
    }
  };

  const resolveBundleModelPath = async (
    candidates: string[],
  ): Promise<string> => {
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
        const manifestJson = await RagPackReader.readFileAtPath(
          `${root}/manifest.json`,
        );
        const manifest = JSON.parse(manifestJson) as {
          models?: { llm?: { file?: string }; embed?: { file?: string } };
        };
        const llmFile = manifest?.models?.llm?.file;
        const embedFile = manifest?.models?.embed?.file;
        if (llmFile && (await fileExists(`${root}/${llmFile}`)))
          chatModelPath = `${root}/${llmFile}`;
        if (embedFile && (await fileExists(`${root}/${embedFile}`)))
          embedModelPath = `${root}/${embedFile}`;
      } catch {
        /* use fallbacks */
      }
    }
    const packEmbed = `${root}/models/embed/embed.gguf`;
    const packLlm = `${root}/models/llm/model.gguf`;
    if (!embedModelPath && (await fileExists(packEmbed)))
      embedModelPath = packEmbed;
    if (!chatModelPath && (await fileExists(packLlm))) chatModelPath = packLlm;
  }

  if (!embedModelPath || !chatModelPath) {
    try {
      const [embedPath, llmPath] = await Promise.all([
        resolveBundleModelPath(BUNDLE_EMBED_PATH_CANDIDATES),
        resolveBundleModelPath(BUNDLE_LLM_PATH_CANDIDATES),
      ]);
      if (embedPath && !embedModelPath) embedModelPath = embedPath;
      if (llmPath && !chatModelPath) chatModelPath = llmPath;
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
          if (
            !embedModelPath &&
            (await fileExists(`${dir}/${EMBED_MODEL_FILENAME}`))
          )
            embedModelPath = `${dir}/${EMBED_MODEL_FILENAME}`;
          if (
            !chatModelPath &&
            (await fileExists(`${dir}/${CHAT_MODEL_FILENAME}`))
          )
            chatModelPath = `${dir}/${CHAT_MODEL_FILENAME}`;
        }
      }
    } catch {
      /* app models path not available */
    }
  }

  if (embedModelPath || chatModelPath) {
    logInfo('Runtime', 'Model paths', {
      embed: embedModelPath || null,
      chat: chatModelPath || null,
    });
  }
  return { embedModelPath, chatModelPath };
}
