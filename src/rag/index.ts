/**
 * RAG integration layer: init, pack load, ask (embed → retrieve → complete → validate).
 * See plan: Ollama RAG and validation.
 */

import type { PackFileReader, PackState, RagInitParams } from './types';
import { loadPack, getPackEmbedModelId } from './loadPack';
import { ragError } from './errors';

export type { PackState, PackFileReader, RagInitParams } from './types';
export { ragError } from './errors';
export type { RagErrorCode } from './errors';
export type { ValidationSummary } from './validate';
export { createThrowReader, createBundlePackReader, BUNDLE_PACK_ROOT } from './packFileReader';
export { getPackEmbedModelId } from './loadPack';

import type { ValidationSummary } from './validate';
import type { RetrievalHit } from './types';

/** Result of ask(question). */
export interface AskResult {
  raw: string;
  nudged: string;
  validationSummary: ValidationSummary;
}

let packState: PackState | null = null;
let initParams: RagInitParams | null = null;
let fileReader: PackFileReader | null = null;

/**
 * Initialize the RAG layer: load pack, validate capability, enforce embed_model_id.
 * Call with a PackFileReader that reads paths relative to packRoot (e.g. from app document dir or assets).
 * Idempotent: if already initialized with the same pack root, returns existing state without reloading.
 */
export async function init(
  params: RagInitParams,
  reader: PackFileReader
): Promise<PackState> {
  if (packState && initParams && fileReader && initParams.packRoot === params.packRoot) {
    return packState;
  }
  const state = await loadPack(reader, params);
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
 */
export async function ask(
  _question: string,
  _options?: { signal?: AbortSignal }
): Promise<AskResult> {
  if (!packState || !fileReader || !initParams) {
    throw ragError('E_NOT_INITIALIZED', 'RAG layer not initialized; call init() first.');
  }
  const validateModule = await import('./validate');
  const { runRagFlow } = await import('./ask');
  const result = await runRagFlow(
    packState,
    initParams,
    fileReader,
    _question,
    _options
  );
  const nudgeResult = await validateModule.nudgeResponse(
    result.raw,
    packState,
    fileReader
  );
  return {
    raw: result.raw,
    nudged: nudgeResult.nudgedText,
    validationSummary: nudgeResult.summary,
  };
}

/** Release pack state (e.g. on logout or pack change). */
export function release(): void {
  packState = null;
  initParams = null;
  fileReader = null;
}
