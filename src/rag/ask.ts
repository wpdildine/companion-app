/**
 * RAG flow: embed → retrieve → merge → context → completion. Returns raw response.
 */

import type { PackState, PackFileReader, RagInitParams } from './types';
import { loadVectors, searchL2, loadChunksForRows } from './retrieval';
import { buildContextBlock, buildPrompt } from './prompt';
import { ragError } from './errors';

const RULES_WEIGHT = 0.6;
const CARDS_WEIGHT = 0.4;
const TOP_K_RULES = 6;
const TOP_K_CARDS = 4;
const TOP_K_MERGE = 8;

export interface RunRagFlowResult {
  raw: string;
}

let embedContext: import('llama.rn').LlamaContext | null = null;
let chatContext: import('llama.rn').LlamaContext | null = null;

async function getEmbedContext(embedModelPath: string): Promise<import('llama.rn').LlamaContext> {
  if (embedContext) return embedContext;
  const { initLlama } = require('llama.rn');
  const ctx = await initLlama({
    model: embedModelPath,
    pooling_type: 'mean',
    n_ctx: 512,
  });
  embedContext = ctx;
  return ctx;
}

async function getChatContext(chatModelPath: string): Promise<import('llama.rn').LlamaContext> {
  if (chatContext) return chatContext;
  const { initLlama } = require('llama.rn');
  const ctx = await initLlama({
    model: chatModelPath,
    n_ctx: 2048,
  });
  chatContext = ctx;
  return ctx;
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
  const listResult = runListPreClassifier(question, packState);
  if (listResult?.useListPath) {
    return { raw: '[Deterministic list path not yet implemented]' };
  }
  const embedCtx = await getEmbedContext(params.embedModelPath);
  const chatCtx = await getChatContext(params.chatModelPath);

  const rulesMeta = packState.rules.indexMeta;
  const cardsMeta = packState.cards.indexMeta;
  if (rulesMeta.dim !== cardsMeta.dim) {
    throw ragError('E_RETRIEVAL', 'Rules and cards index dim mismatch');
  }

  const queryEmbedding = await embedCtx.embedding(question);
  const queryVec = new Float32Array(queryEmbedding.embedding);
  if (queryVec.length !== rulesMeta.dim) {
    throw ragError('E_EMBED_MISMATCH', `Query embedding dim ${queryVec.length} !== index dim ${rulesMeta.dim}`);
  }

  const [rulesIndex, cardsIndex] = await Promise.all([
    loadVectors(reader, packState.rules.vectorsPath, rulesMeta, 'rules'),
    loadVectors(reader, packState.cards.vectorsPath, cardsMeta, 'cards'),
  ]);

  const rulesTopK = Math.min(TOP_K_RULES, rulesIndex.nRows);
  const cardsTopK = Math.min(TOP_K_CARDS, cardsIndex.nRows);
  const rulesHits = searchL2(rulesIndex, queryVec, rulesTopK);
  const cardsHits = searchL2(cardsIndex, queryVec, cardsTopK);

  const merged = mergeHits(rulesHits, cardsHits);
  const topMerged = merged.slice(0, TOP_K_MERGE);

  const rulesRowIds = topMerged.filter((h) => h.source_type === 'rules').map((h) => h.rowId);
  const cardsRowIds = topMerged.filter((h) => h.source_type === 'cards').map((h) => h.rowId);

  const [rulesChunks, cardsChunks] = await Promise.all([
    loadChunksForRows(reader, packState.rules.chunksPath, rulesRowIds),
    loadChunksForRows(reader, packState.cards.chunksPath, cardsRowIds),
  ]);

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

  const contextBlock = buildContextBlock(chunksForPrompt);
  const prompt = buildPrompt(contextBlock, question);

  const result = await chatCtx.completion({
    prompt,
    n_predict: 512,
    temperature: 0.3,
  });

  const raw = result?.text ?? result?.content ?? '';
  return { raw };
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
    normScore: RULES_WEIGHT * (1 - rNorm(h.score)),
  }));
  const cardsWithDocId = cardsHits.map((h) => ({
    ...h,
    source_type: 'cards' as const,
    doc_id: `cards:${h.rowId}`,
    normScore: CARDS_WEIGHT * (1 - cNorm(h.score)),
  }));
  const all = [...rulesWithDocId, ...cardsWithDocId];
  all.sort((a, b) => b.normScore - a.normScore);
  for (const h of all) {
    out.push({ rowId: h.rowId, score: h.score, source_type: h.source_type, doc_id: h.doc_id });
  }
  return out;
}
