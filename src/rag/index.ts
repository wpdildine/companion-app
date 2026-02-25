/**
 * RAG integration layer: init, pack load, ask (embed → retrieve → complete → validate).
 * In this app version (RAG_USE_DETERMINISTIC_CONTEXT_ONLY) embeddings are not present;
 * the canonical path is deterministic context provider + LLM format/summarize only.
 * See plan: Ollama RAG and validation.
 */

import type { PackFileReader, PackState, RagInitParams } from './types';
import { loadPack } from './loadPack';
import { ragError } from './errors';

export type { PackState, PackFileReader, RagInitParams } from './types';
export { RAG_USE_DETERMINISTIC_CONTEXT_ONLY } from './types';
export { ragError } from './errors';
export { RAG_CONFIG } from './config';
export { applyPackRagConfig } from './config';
export type { RagConfig, PackRagConfig } from './config';
export type { RagErrorCode } from './errors';
export type { ValidationSummary } from './validate';
export {
  createThrowReader,
  createBundlePackReader,
  createDocumentsPackReader,
  getContentPackPathInDocuments,
  copyBundlePackToDocuments,
  BUNDLE_PACK_ROOT,
} from './packFileReader';
export { getPackEmbedModelId, PACK_EMBED_MODEL_ID_DETERMINISTIC_ONLY } from './loadPack';

import type { ValidationSummary } from './validate';
import { runHumanShortPipeline, runPipelineHumanShort } from '@mtg/runtime';

/** Options for ask(). */
export interface AskOptions {
  signal?: AbortSignal;
  /** When true, skip nudgeResponse (return raw as nudged, empty validation). Use to match CLI/local output for debugging. */
  debugSkipNudge?: boolean;
}

/** Result of ask(question). */
export interface AskResult {
  raw: string;
  nudged: string;
  validationSummary: ValidationSummary;
}

/** Set to true to disable nudge globally (for debugging prompt/chunks vs CLI). */
export let RAG_DEBUG_SKIP_NUDGE = true;

let packState: PackState | null = null;
let initParams: RagInitParams | null = null;
let fileReader: PackFileReader | null = null;

/** Guard: only one ask() at a time to avoid concurrent inference and duplicate class issues. */
let askInFlight = false;

/**
 * Initialize the RAG layer: load pack, validate capability, enforce embed_model_id.
 * Call with a PackFileReader that reads paths relative to packRoot (e.g. from app document dir or assets).
 * Idempotent: if already initialized with the same pack root, returns existing state without reloading.
 */
export async function init(
  params: RagInitParams,
  reader: PackFileReader
): Promise<PackState> {
  const t0 = Date.now();
  const mark = (msg: string) => console.log(`[RAG][${Date.now() - t0}ms] ${msg}`);
  mark('init start');
  if (packState && initParams && fileReader && initParams.packRoot === params.packRoot) {
    mark('init end (cached)');
    return packState;
  }
  const state = await loadPack(reader, params);
  mark('init end (pack loaded)');
  packState = state;
  initParams = params;
  fileReader = reader;
  return state;
}

/** Get current pack state (null if not initialized). */
export function getPackState(): PackState | null {
  return packState;
}

/** Get init params (null if not initialized). */
export function getInitParams(): RagInitParams | null {
  return initParams;
}

/** Get file reader (null if not initialized). */
export function getFileReader(): PackFileReader | null {
  return fileReader;
}

/**
 * Ask a question: optional list pre-classifier → embed → retrieve → context → completion → validate → nudge.
 * Returns { raw, nudged, validationSummary }. Throws if not initialized or on embed/retrieval/completion error.
 * Use options.debugSkipNudge or RAG_DEBUG_SKIP_NUDGE to disable nudge for debugging (match CLI output).
 */
export async function ask(
  _question: string,
  options?: AskOptions
): Promise<AskResult> {
  if (!packState || !fileReader || !initParams) {
    throw ragError('E_NOT_INITIALIZED', 'RAG layer not initialized; call init() first.');
  }
  if (askInFlight) {
    throw ragError('E_RETRIEVAL', 'Another ask is already in progress. Wait for it to finish.');
  }
  const skipNudge = options?.debugSkipNudge ?? RAG_DEBUG_SKIP_NUDGE;
  askInFlight = true;
  try {
    const normalizeHumanShortLines = (text: string): string => {
      const lines = (text ?? '')
        .split('\n')
        .map((ln) => ln.trim())
        .filter((ln) => ln.length > 0)
        .map((ln) => ln.replace(/^(?:-\s+|\u2022\s*|\*\s+)/, '').trim());
      return lines.join('\n').trim();
    };
    const toHumanShort = (
      rawText: string,
      contextText?: string,
      intent?: string
    ): string => {
      if ((contextText ?? '').trim().length > 0) {
        return normalizeHumanShortLines(
          runPipelineHumanShort(
            rawText,
            contextText ?? '',
            _question,
            intent ?? 'unknown'
          ).finalText
        );
      }
      return normalizeHumanShortLines(runHumanShortPipeline(rawText));
    };
    const { runRagFlow } = await import('./ask');
    const result = await runRagFlow(
      packState,
      initParams,
      fileReader,
      _question,
      options
    );
    if (skipNudge) {
      return {
        raw: result.raw,
        nudged: toHumanShort(result.raw, result.contextText, result.intent),
        validationSummary: {
          cards: [],
          rules: [],
          stats: { cardHitRate: 0, ruleHitRate: 0, unknownCardCount: 0, invalidRuleCount: 0 },
        },
      };
    }
    const validateModule = await import('./validate');
    const nudgeResult = await validateModule.nudgeResponse(
      result.raw,
      packState,
      fileReader
    );
    return {
      raw: result.raw,
      nudged: toHumanShort(nudgeResult.nudgedText, result.contextText, result.intent),
      validationSummary: nudgeResult.summary,
    };
  } finally {
    askInFlight = false;
  }
}

/** Release pack state (e.g. on logout or pack change). */
export function release(): void {
  packState = null;
  initParams = null;
  fileReader = null;
}
