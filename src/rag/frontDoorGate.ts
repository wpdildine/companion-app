/**
 * Substrate semantic front-door authorization before vector/Ollama retrieval.
 * Delegates to getContextRN (same inputs as deterministic context) — runtime-only.
 *
 * Path note (Cycle 7): When `RAG_USE_DETERMINISTIC_CONTEXT_ONLY` is true, this returns false
 * so `runRagFlow` does not call `checkFrontDoorBeforeRetrieval` here — gating still runs inside
 * `getContextRN` on the deterministic branch. Vector/Ollama paths use this explicit pre-retrieval
 * gate so embedding/HTTP never runs when the verdict is not `proceed_to_retrieval`.
 */

import type { SemanticFrontDoor } from '@atlas/runtime';
import { getContextRN } from './getContextRN';
import type { PackFileReader, RagInitParams } from './types';
import { RAG_USE_DETERMINISTIC_CONTEXT_ONLY } from './types';

function paramsUseOllama(params: RagInitParams): boolean {
  return !!(
    params.ollamaHost &&
    params.ollamaEmbedModel &&
    params.ollamaChatModel
  );
}

/**
 * When true, runRagFlow must call checkFrontDoorBeforeRetrieval before any
 * embedding, vector retrieval, or chunk load (Ollama or on-device vector path).
 * Deterministic-only mode uses getContextRN internally and already gates.
 */
export function shouldRunFrontDoorGateBeforeRetrieval(
  params: RagInitParams,
): boolean {
  if (RAG_USE_DETERMINISTIC_CONTEXT_ONLY) return false;
  if (paramsUseOllama(params)) return true;
  return !!(params.embedModelPath?.trim() && params.chatModelPath?.trim());
}

export async function checkFrontDoorBeforeRetrieval(
  question: string,
  packRoot: string,
  reader: PackFileReader,
): Promise<{ blocked: boolean; semanticFrontDoor: SemanticFrontDoor }> {
  const result = await getContextRN(question, packRoot, reader);
  const fd = result.semanticFrontDoor;
  const blocked = fd.front_door_verdict !== 'proceed_to_retrieval';
  return { blocked, semanticFrontDoor: fd };
}
