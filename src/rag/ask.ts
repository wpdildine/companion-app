/**
 * RAG flow: embed → retrieve → merge → context → completion. Returns raw response.
 * Supports either on-device llama.rn (GGUF paths) or Ollama HTTP API.
 */

import type { PackState, PackFileReader, RagInitParams } from './types';
import { RAG_USE_DETERMINISTIC_CONTEXT_ONLY } from './types';
import { loadVectors, searchL2, loadChunksForRows } from './retrieval';
import { trimChunksToFitPrompt, buildPrompt } from './prompt';
import { ragError } from './errors';
import { RAG_CONFIG } from './config';

export interface RunRagFlowResult {
  raw: string;
  /** Context used for deterministic human_short post-processing when available. */
  contextText?: string;
  /** Intent label used by runtime post-processing (defaults to unknown). */
  intent?: string;
}

let embedContext: import('llama.rn').LlamaContext | null = null;
let chatContext: import('llama.rn').LlamaContext | null = null;

function useOllama(params: RagInitParams): boolean {
  return !!(
    params.ollamaHost &&
    params.ollamaEmbedModel &&
    params.ollamaChatModel
  );
}

async function ollamaEmbedding(host: string, model: string, prompt: string): Promise<number[]> {
  const base = host.replace(/\/$/, '');
  const res = await fetch(`${base}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw ragError('E_OLLAMA', `Ollama embeddings failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { embedding?: number[] };
  if (!Array.isArray(data.embedding)) {
    throw ragError('E_OLLAMA', 'Ollama embeddings response missing embedding array');
  }
  return data.embedding;
}

async function ollamaGenerate(host: string, model: string, prompt: string): Promise<string> {
  const base = host.replace(/\/$/, '');
  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw ragError('E_OLLAMA', `Ollama generate failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { response?: string };
  return typeof data.response === 'string' ? data.response : '';
}

async function getEmbedContext(embedModelPath: string): Promise<import('llama.rn').LlamaContext> {
  if (embedContext) return embedContext;
  const { initLlama } = require('llama.rn');
  const ctx = await initLlama({
    model: embedModelPath,
    embedding: true,
    pooling_type: 'mean',
    n_ctx: RAG_CONFIG.embed_n_ctx,
  });
  embedContext = ctx;
  return ctx;
}

async function getChatContext(chatModelPath: string): Promise<import('llama.rn').LlamaContext> {
  if (chatContext) return chatContext;
  const { initLlama } = require('llama.rn');
  const ctx = await initLlama({
    model: chatModelPath,
    n_ctx: RAG_CONFIG.chat_n_ctx,
  });
  chatContext = ctx;
  return ctx;
}

/** Chunk shape used for prompt (for debug logging). */
interface ChunkForPromptLog {
  doc_id: string;
  source_type: 'rules' | 'cards';
  title?: string;
  text?: string;
}

function logDebugPromptAndChunks(
  chunks: ChunkForPromptLog[],
  prompt: string,
  generationParams: Record<string, unknown> | null,
  chatModelPathOrLabel: string
): void {
  console.log('[RAG][DEBUG] --- final prompt ---');
  console.log('[RAG][DEBUG] prompt length (chars):', prompt.length);
  const preview = prompt.length <= RAG_CONFIG.debug.prompt_preview_len
    ? prompt
    : prompt.slice(0, RAG_CONFIG.debug.prompt_preview_len) + '...';
  console.log('[RAG][DEBUG] prompt preview:', preview);
  console.log('[RAG][DEBUG] --- retrieved chunks (top K) ---');
  chunks.forEach((c, i) => {
    const excerpt = (c.text ?? '').slice(0, RAG_CONFIG.debug.excerpt_len);
    const excerptSuffix = (c.text?.length ?? 0) > RAG_CONFIG.debug.excerpt_len ? '...' : '';
    console.log(`[RAG][DEBUG] chunk ${i + 1}: doc_id=${c.doc_id} source_type=${c.source_type} title=${c.title ?? '(none)'}`);
    console.log(`[RAG][DEBUG]   excerpt: ${excerpt}${excerptSuffix}`);
  });
  if (generationParams) {
    console.log('[RAG][DEBUG] --- generation params ---', JSON.stringify(generationParams));
  }
  console.log('[RAG][DEBUG] --- chat model ---', chatModelPathOrLabel);
  console.log('[RAG][DEBUG] (Compute SHA256 of model file locally to confirm same artifact as CLI.)');
}

/**
 * Optional list/filter pre-classifier. When pack has structured card fields or card_meta.jsonl,
 * returns a deterministic list path; else returns null and caller uses RAG path.
 */
export function runListPreClassifier(
  _question: string,
  _packState: PackState
): { useListPath: boolean } | null {
  const hasStructured =
    _packState.manifest?.sidecars?.capabilities?.card_meta != null;
  if (!hasStructured) return null;
  return { useListPath: false };
}

/**
 * Run full RAG flow: embed query → L2 top-k rules + cards → merge → load chunks → prompt → completion.
 */
export async function runRagFlow(
  packState: PackState,
  params: RagInitParams,
  reader: PackFileReader,
  question: string,
  _options?: { signal?: AbortSignal }
): Promise<RunRagFlowResult> {
  const t0 = Date.now();
  const mark = (msg: string) => console.log(`[RAG][${Date.now() - t0}ms] ${msg}`);
  mark('runRagFlow start');

  const listResult = runListPreClassifier(question, packState);
  if (listResult?.useListPath) {
    return { raw: '[Deterministic list path not yet implemented]', intent: 'unknown' };
  }

  const rulesMeta = packState.rules.indexMeta;
  const cardsMeta = packState.cards.indexMeta;
  if (rulesMeta.dim !== cardsMeta.dim) {
    throw ragError('E_RETRIEVAL', 'Rules and cards index dim mismatch');
  }

  let queryVec: Float32Array;
  let raw: string;

  if (useOllama(params)) {
    const host = params.ollamaHost!;
    const embedModel = params.ollamaEmbedModel!;
    const chatModel = params.ollamaChatModel!;
    const embedding = await ollamaEmbedding(host, embedModel, question);
    queryVec = new Float32Array(embedding);
    if (queryVec.length !== rulesMeta.dim) {
      throw ragError('E_EMBED_MISMATCH', `Ollama embedding dim ${queryVec.length} !== index dim ${rulesMeta.dim}. Use model that matches pack (e.g. nomic-embed-text).`);
    }

    mark('vectors load start');
    const [rulesIndex, cardsIndex] = await Promise.all([
      loadVectors(reader, packState.rules.vectorsPath, rulesMeta, 'rules'),
      loadVectors(reader, packState.cards.vectorsPath, cardsMeta, 'cards'),
    ]);
    mark('vectors load end');
    mark('retrieval start');
    const rulesTopK = Math.min(RAG_CONFIG.retrieval.top_k_rules, rulesIndex.nRows);
    const cardsTopK = Math.min(RAG_CONFIG.retrieval.top_k_cards, cardsIndex.nRows);
    const rulesHits = searchL2(rulesIndex, queryVec, rulesTopK);
    const cardsHits = searchL2(cardsIndex, queryVec, cardsTopK);
    const merged = mergeHits(rulesHits, cardsHits);
    const topMerged = merged.slice(0, RAG_CONFIG.retrieval.top_k_merge);
    mark('retrieval end');
    const rulesRowIds = topMerged.filter((h) => h.source_type === 'rules').map((h) => h.rowId);
    const cardsRowIds = topMerged.filter((h) => h.source_type === 'cards').map((h) => h.rowId);
    mark('chunks load start');
    const [rulesChunks, cardsChunks] = await Promise.all([
      loadChunksForRows(reader, packState.rules.chunksPath, rulesRowIds),
      loadChunksForRows(reader, packState.cards.chunksPath, cardsRowIds),
    ]);
    mark('chunks load end');
    const chunksForPrompt = topMerged.map((h) => {
      const map = h.source_type === 'rules' ? rulesChunks : cardsChunks;
      const c = map.get(h.rowId);
      return {
        doc_id: c?.doc_id ?? h.doc_id,
        source_type: h.source_type,
        title: c?.title,
        text: c?.text,
      };
    });
    mark('context build start');
    const { prompt } = trimChunksToFitPrompt(chunksForPrompt, question);
    mark('context build end');
    logDebugPromptAndChunks(chunksForPrompt, prompt, null, `Ollama model=${chatModel} (params server-side)`);
    mark('completion start');
    raw = await ollamaGenerate(host, chatModel, prompt);
    mark('completion end');
  } else {
    if (RAG_USE_DETERMINISTIC_CONTEXT_ONLY) {
      const packRoot = params.packRoot;
      let bundleText = '';

      try {
        const runtime = await import('@mtg/runtime');
        const getContext = runtime.getContext ?? (runtime as { default?: { getContext?: typeof runtime.getContext } }).default?.getContext;
        if (typeof getContext === 'function') {
          mark('getContext start');
          const result = await getContext(question, packRoot);
          mark('getContext end');
          bundleText =
            typeof result === 'string'
              ? result
              : (result as { final_context_bundle_canonical?: string })?.final_context_bundle_canonical ?? '';
        }
      } catch (e) {
        const err = e as { code?: string; message?: string };
        const msg = e instanceof Error ? e.message : String(e);
        if (packRoot && reader) {
          // Runtime getContext is a stub on RN; we use in-app getContextRN. Log as debug, not error.
          console.log('[RAG] getContext (runtime stub), using getContextRN');
        } else {
          console.error('[RAG] getContext failed:', msg, e);
        }
        if (err && typeof err === 'object' && typeof err.code === 'string') throw e;
        if (packRoot && reader) {
          try {
            const { getContextRN } = await import('./getContextRN');
            mark('getContext start');
            const result = await getContextRN(question, packRoot, reader);
            mark('getContext end');
            bundleText = result.final_context_bundle_canonical ?? '';
          } catch (rnErr) {
            console.error('[RAG] getContextRN failed:', rnErr);
            throw ragError(
              'E_DETERMINISTIC_ONLY',
              `Deterministic context provider not available: ${msg}. Ensure @mtg/runtime is installed with RN entrypoint and getContext is exported.`
            );
          }
        } else {
          throw ragError(
            'E_DETERMINISTIC_ONLY',
            `Deterministic context provider not available: ${msg}. Ensure pack is copied to device (packRoot set) and @mtg/runtime or in-app getContextRN is used.`
          );
        }
      }

      if (!bundleText?.trim() && packRoot && reader) {
        try {
          const { getContextRN } = await import('./getContextRN');
          mark('getContext start');
          const result = await getContextRN(question, packRoot, reader);
          mark('getContext end');
          bundleText = result.final_context_bundle_canonical ?? '';
        } catch {
          // ignore
        }
      }
      if (!bundleText?.trim()) {
        throw ragError('E_RETRIEVAL', 'Deterministic context provider returned empty bundle.');
      }
      mark('context build start');
      const prompt = buildPrompt(bundleText, question);
      mark('context build end');
      if (!params.chatModelPath?.trim()) {
        throw ragError('E_MODEL_PATH', 'chatModelPath required for deterministic path.');
      }
      mark('chat model load start');
      const chatCtx = await getChatContext(params.chatModelPath);
      mark('chat model load end');
      mark('completion start');
      const completionResult = await chatCtx.completion({
        prompt,
        n_predict: RAG_CONFIG.n_predict,
        ...RAG_CONFIG.generation,
      });
      raw = completionResult?.text ?? (completionResult as { content?: string })?.content ?? '';
      mark('completion end');
      return { raw, contextText: bundleText, intent: 'unknown' };
    }
    if (!params.embedModelPath?.trim() || !params.chatModelPath?.trim()) {
      throw ragError(
        'E_MODEL_PATH',
        'On-device models not configured. Set embedModelPath and chatModelPath to local GGUF file paths (e.g. in app documents or bundled assets). Pack expects an embed model matching index dim (e.g. nomic-embed-text) and a chat model for completion.'
      );
    }
    mark('embed model load start');
    let embedCtx: import('llama.rn').LlamaContext;
    try {
      embedCtx = await getEmbedContext(params.embedModelPath);
      mark('embed model load end');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      mark('embed model load failed');
      throw ragError('E_MODEL_PATH', `Embed model load failed: ${msg} Path: ${params.embedModelPath}`);
    }

    mark('embedding start');
    const embRes = await embedCtx.embedding(question);
    queryVec = new Float32Array(embRes.embedding);
    if (queryVec.length !== rulesMeta.dim) {
      throw ragError('E_EMBED_MISMATCH', `Query embedding dim ${queryVec.length} !== index dim ${rulesMeta.dim}`);
    }
    mark('embedding end');

    mark('vectors load start');
    const [rulesIndex, cardsIndex] = await Promise.all([
      loadVectors(reader, packState.rules.vectorsPath, rulesMeta, 'rules'),
      loadVectors(reader, packState.cards.vectorsPath, cardsMeta, 'cards'),
    ]);
    mark('vectors load end');

    mark('retrieval start');
    const rulesTopK = Math.min(RAG_CONFIG.retrieval.top_k_rules, rulesIndex.nRows);
    const cardsTopK = Math.min(RAG_CONFIG.retrieval.top_k_cards, cardsIndex.nRows);
    const rulesHits = searchL2(rulesIndex, queryVec, rulesTopK);
    const cardsHits = searchL2(cardsIndex, queryVec, cardsTopK);
    const merged = mergeHits(rulesHits, cardsHits);
    const topMerged = merged.slice(0, RAG_CONFIG.retrieval.top_k_merge);
    mark('retrieval end');

    const rulesRowIds = topMerged.filter((h) => h.source_type === 'rules').map((h) => h.rowId);
    const cardsRowIds = topMerged.filter((h) => h.source_type === 'cards').map((h) => h.rowId);
    mark('chunks load start');
    const [rulesChunks, cardsChunks] = await Promise.all([
      loadChunksForRows(reader, packState.rules.chunksPath, rulesRowIds),
      loadChunksForRows(reader, packState.cards.chunksPath, cardsRowIds),
    ]);
    mark('chunks load end');

    mark('context build start');
    const chunksForPrompt = topMerged.map((h) => {
      const map = h.source_type === 'rules' ? rulesChunks : cardsChunks;
      const c = map.get(h.rowId);
      return {
        doc_id: c?.doc_id ?? h.doc_id,
        source_type: h.source_type,
        title: c?.title,
        text: c?.text,
      };
    });
    const { prompt } = trimChunksToFitPrompt(chunksForPrompt, question);
    mark('context build end');

    logDebugPromptAndChunks(
      chunksForPrompt,
      prompt,
      RAG_CONFIG.generation,
      params.chatModelPath ?? '(none)'
    );

    mark('chat model load start');
    let chatCtx: import('llama.rn').LlamaContext;
    try {
      chatCtx = await getChatContext(params.chatModelPath);
      mark('chat model load end');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      mark('chat model load failed');
      throw ragError('E_MODEL_PATH', `Chat model load failed: ${msg} Path: ${params.chatModelPath}`);
    }

    mark('completion start');
    const result = await chatCtx.completion({
      prompt,
      n_predict: RAG_CONFIG.n_predict,
      ...RAG_CONFIG.generation,
    });
    raw = result?.text ?? result?.content ?? '';
    mark('completion end');
  }

  return { raw, intent: 'unknown' };
}

function mergeHits(
  rulesHits: Array<{ rowId: number; score: number }>,
  cardsHits: Array<{ rowId: number; score: number }>
): Array<{ rowId: number; score: number; source_type: 'rules' | 'cards'; doc_id: string }> {
  const out: Array<{ rowId: number; score: number; source_type: 'rules' | 'cards'; doc_id: string }> = [];
  const rMax = rulesHits.length ? Math.max(...rulesHits.map((h) => h.score)) : 1;
  const cMax = cardsHits.length ? Math.max(...cardsHits.map((h) => h.score)) : 1;
  const rNorm = (s: number) => (rMax > 0 ? s / rMax : 0);
  const cNorm = (s: number) => (cMax > 0 ? s / cMax : 0);
  const rulesWithDocId = rulesHits.map((h) => ({
    ...h,
    source_type: 'rules' as const,
    doc_id: `rules:${h.rowId}`,
    normScore: RAG_CONFIG.retrieval.rules_weight * (1 - rNorm(h.score)),
  }));
  const cardsWithDocId = cardsHits.map((h) => ({
    ...h,
    source_type: 'cards' as const,
    doc_id: `cards:${h.rowId}`,
    normScore: RAG_CONFIG.retrieval.cards_weight * (1 - cNorm(h.score)),
  }));
  const all = [...rulesWithDocId, ...cardsWithDocId];
  all.sort((a, b) => b.normScore - a.normScore);
  for (const h of all) {
    out.push({ rowId: h.rowId, score: h.score, source_type: h.source_type, doc_id: h.doc_id });
  }
  return out;
}
