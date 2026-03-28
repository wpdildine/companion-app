/**
 * RAG flow: embed → retrieve → merge → context → completion. Returns raw response.
 * Supports either on-device llama.rn (GGUF paths) or Ollama HTTP API.
 */

import type {
  GetContextOptions,
  GetContextResult,
  SemanticFrontDoor,
} from '@atlas/runtime';
import { logError, logInfo, logWarn } from '../shared/logging';
import { RAG_CONFIG } from './config';
import {
  CONTEXT_BUNDLE_ERROR,
  CONTEXT_RETRIEVAL_EMPTY,
  ragError,
  ragErrorWithAttribution,
} from './errors';
import { loadChunksForRows, loadVectors, searchL2 } from './retrieval';
import {
  checkFrontDoorBeforeRetrieval,
  shouldRunFrontDoorGateBeforeRetrieval,
} from './frontDoorGate';
import { buildPrompt, trimChunksToFitPrompt } from './runtimePrompt';
import type { PackFileReader, PackState, RagInitParams } from './types';
import { RAG_USE_DETERMINISTIC_CONTEXT_ONLY } from './types';

/** Llama 3 stop sequences (not exported from @atlas/runtime RN entrypoint; define here to avoid passing undefined to native). */
const LLAMA3_STOP_SEQUENCES = ['<|eot_id|>', '<|end_of_text|>'];

export interface RunRagFlowResult {
  raw: string;
  /** Context used for deterministic human_short post-processing when available. */
  contextText?: string;
  /** Intent label used by runtime post-processing (defaults to unknown). */
  intent?: string;
  /** Selected retrieval/context objects that should be available to the settled result surface. */
  contextSelection?: {
    cards: Array<{ name: string; doc_id?: string; oracleText?: string }>;
    rules: Array<{ rule_id: string; title?: string; excerpt?: string }>;
  };
  /** Substrate pre-retrieval gate blocked LLM path (deterministic RN seam). */
  semanticFrontDoor?: SemanticFrontDoor;
  frontDoorBlocked?: boolean;
}

let embedContext: import('llama.rn').LlamaContext | null = null;
let chatContext: import('llama.rn').LlamaContext | null = null;

function shouldUseOllama(params: RagInitParams): boolean {
  return !!(
    params.ollamaHost &&
    params.ollamaEmbedModel &&
    params.ollamaChatModel
  );
}

async function ollamaEmbedding(
  host: string,
  model: string,
  prompt: string,
): Promise<number[]> {
  const base = host.replace(/\/$/, '');
  const res = await fetch(`${base}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw ragError(
      'E_OLLAMA',
      `Ollama embeddings failed: ${res.status} ${text}`,
    );
  }
  const data = (await res.json()) as { embedding?: number[] };
  if (!Array.isArray(data.embedding)) {
    throw ragError(
      'E_OLLAMA',
      'Ollama embeddings response missing embedding array',
    );
  }
  return data.embedding;
}

async function ollamaGenerate(
  host: string,
  model: string,
  prompt: string,
): Promise<string> {
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

async function getEmbedContext(
  embedModelPath: string,
): Promise<import('llama.rn').LlamaContext> {
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

async function getChatContext(
  chatModelPath: string,
): Promise<import('llama.rn').LlamaContext> {
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
  chatModelPathOrLabel: string,
): void {
  console.log('[RAG][DEBUG] --- final prompt ---');
  console.log('[RAG][DEBUG] prompt length (chars):', prompt.length);
  const preview =
    prompt.length <= RAG_CONFIG.debug.prompt_preview_len
      ? prompt
      : prompt.slice(0, RAG_CONFIG.debug.prompt_preview_len) + '...';
  console.log('[RAG][DEBUG] prompt preview:', preview);
  console.log('[RAG][DEBUG] --- retrieved chunks (top K) ---');
  chunks.forEach((c, i) => {
    const excerpt = (c.text ?? '').slice(0, RAG_CONFIG.debug.excerpt_len);
    const excerptSuffix =
      (c.text?.length ?? 0) > RAG_CONFIG.debug.excerpt_len ? '...' : '';
    console.log(
      `[RAG][DEBUG] chunk ${i + 1}: doc_id=${c.doc_id} source_type=${
        c.source_type
      } title=${c.title ?? '(none)'}`,
    );
    console.log(`[RAG][DEBUG]   excerpt: ${excerpt}${excerptSuffix}`);
  });
  if (generationParams) {
    console.log(
      '[RAG][DEBUG] --- generation params ---',
      JSON.stringify(generationParams),
    );
  }
  console.log('[RAG][DEBUG] --- chat model ---', chatModelPathOrLabel);
  console.log(
    '[RAG][DEBUG] (Compute SHA256 of model file locally to confirm same artifact as CLI.)',
  );
}

/**
 * Optional list/filter pre-classifier. When pack has structured card fields or card_meta.jsonl,
 * returns a deterministic list path; else returns null and caller uses RAG path.
 */
export function runListPreClassifier(
  _question: string,
  _packState: PackState,
): { useListPath: boolean } | null {
  const hasStructured =
    _packState.manifest?.sidecars?.capabilities?.card_meta != null;
  if (!hasStructured) return null;
  return { useListPath: false };
}

/** Sink payload for request-debug (same shape as app store.emit). */
export type RagRequestDebugPayload = {
  type: string;
  requestId: number | null;
  timestamp?: number;
  [key: string]: unknown;
};

/**
 * Run full RAG flow: embed query → L2 top-k rules + cards → merge → load chunks → prompt → completion.
 */
export interface RunRagFlowOptions {
  signal?: AbortSignal;
  /** Called with full accumulated text as generation streams. */
  onPartial?: (accumulatedText: string) => void;
  /** Request id from orchestrator; when set with requestDebugSink, RAG emits telemetry. */
  requestId?: number;
  /** Sink for request-scoped debug telemetry. */
  requestDebugSink?: (payload: RagRequestDebugPayload) => void;
  /** Called once when retrieval/context assembly is done, before prompt build. Orchestrator uses for processing substate. */
  onRetrievalComplete?: () => void;
  /** Called once immediately before loading the chat model (getChatContext). Not called on Ollama/non-local path. */
  onModelLoadStart?: () => void;
  /** Called once immediately before starting model inference. Orchestrator uses for processing substate. */
  onGenerationStart?: () => void;
}

function simplePromptHash(prompt: string): string {
  /* eslint-disable no-bitwise */
  let h = 0;
  for (let i = 0; i < prompt.length; i++)
    h = (h << 5) - h + prompt.charCodeAt(i);
  const hash = (h >>> 0).toString(36);
  /* eslint-enable no-bitwise */
  return hash;
}

function extractTotalTokens(result: unknown): number | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const rec = result as Record<string, unknown>;
  const direct = rec.tokens ?? rec.token_count ?? rec.total_tokens;
  if (typeof direct === 'number') return direct;
  const usage = rec.usage as Record<string, unknown> | undefined;
  if (usage && typeof usage.total_tokens === 'number')
    return usage.total_tokens;
  return undefined;
}

function generationTelemetryParams(): Record<string, unknown> {
  const generation = RAG_CONFIG.generation as Record<string, unknown>;
  return {
    temperature: generation.temperature,
    topP: generation.top_p ?? generation.topP,
    topK: generation.top_k ?? generation.topK,
    maxTokens: RAG_CONFIG.n_predict,
  };
}

const PROMPT_PREVIEW_MAX = 200;
const BUNDLE_PREVIEW_MAX = 200;

function toContextSelection(
  bundle:
    | {
        cards?: Array<{
          name?: string;
          oracle_id?: string;
          oracle_text?: string;
        }>;
        rules?: Array<{ rule_id?: string; text?: string }>;
      }
    | null
    | undefined,
): RunRagFlowResult['contextSelection'] | undefined {
  if (!bundle) return undefined;
  const cards =
    bundle.cards
      ?.map(card => ({
        name: card.name?.trim() ?? '',
        doc_id: card.oracle_id?.trim() || undefined,
        oracleText: card.oracle_text?.trim() || undefined,
      }))
      .filter(card => card.name.length > 0) ?? [];
  const rules =
    bundle.rules
      ?.map(rule => ({
        rule_id: rule.rule_id?.trim() ?? '',
        title: rule.rule_id?.trim() || undefined,
        excerpt: rule.text?.trim() || undefined,
      }))
      .filter(rule => rule.rule_id.length > 0) ?? [];
  if (cards.length === 0 && rules.length === 0) return undefined;
  return { cards, rules };
}

export async function runRagFlow(
  packState: PackState,
  params: RagInitParams,
  reader: PackFileReader,
  question: string,
  options?: RunRagFlowOptions,
): Promise<RunRagFlowResult> {
  const t0 = Date.now();
  const mark = (msg: string) =>
    console.log(`[RAG][${Date.now() - t0}ms] ${msg}`);
  mark('runRagFlow start');

  const requestId = options?.requestId ?? null;
  const requestDebugSink = options?.requestDebugSink;
  const emitRag = (type: string, payload: Record<string, unknown>) => {
    if (requestDebugSink)
      requestDebugSink({ type, requestId, timestamp: Date.now(), ...payload });
  };
  if (requestId != null && requestDebugSink) {
    emitRag('rag_retrieval_start', {});
  }

  const listResult = runListPreClassifier(question, packState);
  if (listResult?.useListPath) {
    // Unreachable while `useListPath` stays false. If implemented, must authorize via the same
    // `computeSemanticFrontDoor` substrate path as getContextRN before any list retrieval (Cycle 7).
    return {
      raw: '[Deterministic list path not yet implemented]',
      intent: 'unknown',
    };
  }

  const rulesMeta = packState.rules.indexMeta;
  const cardsMeta = packState.cards.indexMeta;
  if (rulesMeta.dim !== cardsMeta.dim) {
    throw ragErrorWithAttribution(
      'E_RETRIEVAL',
      'Rules and cards index dim mismatch',
      CONTEXT_BUNDLE_ERROR,
    );
  }

  const packRootForGate = params.packRoot?.trim() || packState.packRoot?.trim();
  if (
    packRootForGate &&
    shouldRunFrontDoorGateBeforeRetrieval(params) &&
    reader
  ) {
    const gate = await checkFrontDoorBeforeRetrieval(
      question,
      packRootForGate,
      reader,
    );
    if (gate.blocked) {
      if (requestId != null && requestDebugSink) {
        emitRag('rag_front_door_block', {
          verdict: gate.semanticFrontDoor.front_door_verdict,
          resolverMode: gate.semanticFrontDoor.resolver_mode,
          transcriptDecision: gate.semanticFrontDoor.transcript_decision,
        });
      }
      return {
        raw: '',
        contextText: '',
        intent: 'unknown',
        semanticFrontDoor: gate.semanticFrontDoor,
        frontDoorBlocked: true,
      };
    }
  }

  let queryVec: Float32Array;
  let raw: string;

  if (shouldUseOllama(params)) {
    const host = params.ollamaHost!;
    const embedModel = params.ollamaEmbedModel!;
    const chatModel = params.ollamaChatModel!;
    const embedding = await ollamaEmbedding(host, embedModel, question);
    queryVec = new Float32Array(embedding);
    if (queryVec.length !== rulesMeta.dim) {
      throw ragError(
        'E_EMBED_MISMATCH',
        `Ollama embedding dim ${queryVec.length} !== index dim ${rulesMeta.dim}. Use model that matches pack (e.g. nomic-embed-text).`,
      );
    }

    mark('vectors load start');
    const [rulesIndex, cardsIndex] = await Promise.all([
      loadVectors(reader, packState.rules.vectorsPath, rulesMeta, 'rules'),
      loadVectors(reader, packState.cards.vectorsPath, cardsMeta, 'cards'),
    ]);
    mark('vectors load end');
    mark('retrieval start');
    const rulesTopK = Math.min(
      RAG_CONFIG.retrieval.top_k_rules,
      rulesIndex.nRows,
    );
    const cardsTopK = Math.min(
      RAG_CONFIG.retrieval.top_k_cards,
      cardsIndex.nRows,
    );
    const rulesHits = searchL2(rulesIndex, queryVec, rulesTopK);
    const cardsHits = searchL2(cardsIndex, queryVec, cardsTopK);
    const merged = mergeHits(rulesHits, cardsHits);
    const topMerged = merged.slice(0, RAG_CONFIG.retrieval.top_k_merge);
    mark('retrieval end');
    if (requestId != null && requestDebugSink) {
      emitRag('rag_retrieval_mode', { retrievalMode: 'vector' });
    }
    const rulesRowIds = topMerged
      .filter(h => h.source_type === 'rules')
      .map(h => h.rowId);
    const cardsRowIds = topMerged
      .filter(h => h.source_type === 'cards')
      .map(h => h.rowId);
    mark('chunks load start');
    const [rulesChunks, cardsChunks] = await Promise.all([
      loadChunksForRows(reader, packState.rules.chunksPath, rulesRowIds),
      loadChunksForRows(reader, packState.cards.chunksPath, cardsRowIds),
    ]);
    mark('chunks load end');
    const chunksForPrompt = topMerged.map(h => {
      const map = h.source_type === 'rules' ? rulesChunks : cardsChunks;
      const c = map.get(h.rowId);
      return {
        doc_id: c?.doc_id ?? h.doc_id,
        source_type: h.source_type,
        title: c?.title,
        text: c?.text,
      };
    });
    options?.onRetrievalComplete?.();
    mark('context build start');
    const { prompt, contextBlock } = trimChunksToFitPrompt(
      chunksForPrompt,
      question,
    );
    mark('context build end');
    if (requestId != null && requestDebugSink) {
      emitRag('rag_retrieval_mode', { retrievalMode: 'vector' });
      emitRag('rag_context_bundle_selected', {
        contextLength: contextBlock.length,
        rulesCount: chunksForPrompt.filter(c => c.source_type === 'rules')
          .length,
        cardsCount: chunksForPrompt.filter(c => c.source_type === 'cards')
          .length,
        bundlePreview:
          contextBlock.slice(0, BUNDLE_PREVIEW_MAX) +
          (contextBlock.length > BUNDLE_PREVIEW_MAX ? '…' : ''),
      });
      emitRag('rag_context_assembled', {
        contextLength: contextBlock.length,
        rulesCount: chunksForPrompt.filter(c => c.source_type === 'rules')
          .length,
        cardsCount: chunksForPrompt.filter(c => c.source_type === 'cards')
          .length,
        bundlePreview:
          contextBlock.slice(0, BUNDLE_PREVIEW_MAX) +
          (contextBlock.length > BUNDLE_PREVIEW_MAX ? '…' : ''),
      });
      emitRag('rag_retrieval_complete', {
        retrievalMode: 'vector',
        contextLength: contextBlock.length,
        rulesCount: chunksForPrompt.filter(c => c.source_type === 'rules')
          .length,
        cardsCount: chunksForPrompt.filter(c => c.source_type === 'cards')
          .length,
        bundlePreview:
          contextBlock.slice(0, BUNDLE_PREVIEW_MAX) +
          (contextBlock.length > BUNDLE_PREVIEW_MAX ? '…' : ''),
      });
      emitRag('rag_prompt_built', {
        promptLength: prompt.length,
        contextLength: contextBlock.length,
        rulesCount: chunksForPrompt.filter(c => c.source_type === 'rules')
          .length,
        cardsCount: chunksForPrompt.filter(c => c.source_type === 'cards')
          .length,
        promptPreview:
          prompt.slice(0, PROMPT_PREVIEW_MAX) +
          (prompt.length > PROMPT_PREVIEW_MAX ? '…' : ''),
        promptHash: simplePromptHash(prompt),
      });
      emitRag('rag_generation_request_start', {
        modelId: chatModel,
        ...generationTelemetryParams(),
      });
    }
    logDebugPromptAndChunks(
      chunksForPrompt,
      prompt,
      null,
      `Ollama model=${chatModel} (params server-side)`,
    );
    options?.onGenerationStart?.();
    mark('completion start');
    const completionStartedAt = Date.now();
    raw = await ollamaGenerate(host, chatModel, prompt);
    mark('completion end');
    if (requestId != null && requestDebugSink) {
      emitRag('rag_generation_complete', {
        finalLength: raw.length,
        generationTimeMs: Date.now() - completionStartedAt,
      });
    }
  } else {
    if (RAG_USE_DETERMINISTIC_CONTEXT_ONLY) {
      const packRoot = params.packRoot;
      let bundleText = '';
      let bundleRulesCount: number | undefined;
      let bundleCardsCount: number | undefined;
      let bundleId: string | undefined;
      let ruleSetId: string | undefined;
      let contextSelection: RunRagFlowResult['contextSelection'];
      logInfo('RAG', 'deterministic context requested', {
        packRootPresent: !!packRoot,
        readerPresent: !!reader,
        questionChars: question.length,
        packRoot: packRoot ?? null,
      });

      try {
        if (packRoot && reader) {
          const { getContextRN } = await import('./getContextRN');
          mark('getContext start');
          const result = await getContextRN(question, packRoot, reader);
          mark('getContext end');
          bundleText = result.final_context_bundle_canonical ?? '';
          contextSelection = toContextSelection(result.bundle);
          if (result?.bundle) {
            bundleRulesCount = Array.isArray(result.bundle.rules)
              ? result.bundle.rules.length
              : undefined;
            bundleCardsCount = Array.isArray(result.bundle.cards)
              ? result.bundle.cards.length
              : undefined;
            bundleId = (result.bundle as { bundle_id?: string }).bundle_id;
            ruleSetId = (result.bundle as { rule_set_id?: string }).rule_set_id;
          }
          logInfo('RAG', 'getContextRN completed', {
            bundleChars: bundleText.length,
            frontDoorVerdict: result.semanticFrontDoor?.front_door_verdict,
          });
          if (
            result.semanticFrontDoor &&
            result.semanticFrontDoor.front_door_verdict !==
              'proceed_to_retrieval'
          ) {
            if (requestId != null && requestDebugSink) {
              emitRag('rag_front_door_block', {
                verdict: result.semanticFrontDoor.front_door_verdict,
                resolverMode: result.semanticFrontDoor.resolver_mode,
                transcriptDecision:
                  result.semanticFrontDoor.transcript_decision,
              });
            }
            return {
              raw: '',
              contextText: '',
              intent: 'unknown',
              semanticFrontDoor: result.semanticFrontDoor,
              frontDoorBlocked: true,
            };
          }
        } else {
          logWarn(
            'RAG',
            'deterministic context: using Node getContext fallback (missing packRoot or reader); production app should use getContextRN',
            { packRootPresent: !!packRoot, readerPresent: !!reader },
          );
          const runtimeModule = (await import('@atlas/runtime')) as unknown as {
            getContext?: (question: string, packRoot: string) => unknown;
            default?: {
              getContext?: (question: string, packRoot: string) => unknown;
            };
          };
          const getContextRaw =
            runtimeModule.getContext ?? runtimeModule.default?.getContext;
          const getContext = getContextRaw as
            | ((
                q: string,
                p: string,
                o?: GetContextOptions,
              ) => Promise<GetContextResult>)
            | undefined;
          if (typeof getContext === 'function') {
            mark('getContext start');
            const result = await getContext(question, packRoot, {
              includeTrace: true,
            });
            mark('getContext end');
            const gc = result as GetContextResult;
            if (
              gc.semanticFrontDoor &&
              gc.semanticFrontDoor.front_door_verdict !==
                'proceed_to_retrieval'
            ) {
              if (requestId != null && requestDebugSink) {
                emitRag('rag_front_door_block', {
                  verdict: gc.semanticFrontDoor.front_door_verdict,
                  resolverMode: gc.semanticFrontDoor.resolver_mode,
                  transcriptDecision:
                    gc.semanticFrontDoor.transcript_decision,
                });
              }
              return {
                raw: '',
                contextText: '',
                intent: 'unknown',
                semanticFrontDoor: gc.semanticFrontDoor,
                frontDoorBlocked: true,
              };
            }
            bundleText =
              typeof result === 'string'
                ? result
                : gc.trace?.final_context_bundle_canonical ?? '';
            const bundle = gc?.bundle;
            if (bundle) {
              contextSelection = toContextSelection(
                bundle as {
                  cards?: Array<{
                    name?: string;
                    oracle_id?: string;
                    oracle_text?: string;
                  }>;
                  rules?: Array<{ rule_id?: string; text?: string }>;
                },
              );
              bundleRulesCount = Array.isArray(bundle.rules)
                ? bundle.rules.length
                : undefined;
              bundleCardsCount = Array.isArray(bundle.cards)
                ? bundle.cards.length
                : undefined;
              bundleId = (bundle as { bundle_id?: string }).bundle_id;
              ruleSetId = (bundle as { rule_set_id?: string }).rule_set_id;
            }
            logInfo('RAG', 'runtime deterministic context completed', {
              bundleChars: bundleText.length,
            });
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isBundleLoadError = msg
          .toLowerCase()
          .includes('could not load bundle');
        if (packRoot && reader) {
          logError('RAG', 'getContextRN failed', { message: msg });
          throw ragErrorWithAttribution(
            'E_RETRIEVAL',
            `Deterministic context provider could not load bundle. Ensure content_pack is present on device and packRoot is valid.`,
            CONTEXT_BUNDLE_ERROR,
          );
        } else {
          logError('RAG', 'runtime getContext failed', { message: msg });
          if (isBundleLoadError) {
            throw ragErrorWithAttribution(
              'E_RETRIEVAL',
              `Deterministic context provider could not load bundle. Ensure content_pack is present on device and packRoot is valid.`,
              CONTEXT_BUNDLE_ERROR,
            );
          }
          throw ragError(
            'E_DETERMINISTIC_ONLY',
            `Deterministic context provider not available: ${msg}. Ensure pack is copied to device (packRoot set) and @atlas/runtime or in-app getContextRN is used.`,
          );
        }
      }

      if (!bundleText?.trim() && packRoot && reader) {
        try {
          const { getContextRN } = await import('./getContextRN');
          mark('getContext start');
          const retryResult = await getContextRN(question, packRoot, reader);
          mark('getContext end');
          if (
            retryResult.semanticFrontDoor &&
            retryResult.semanticFrontDoor.front_door_verdict !==
              'proceed_to_retrieval'
          ) {
            return {
              raw: '',
              contextText: '',
              intent: 'unknown',
              semanticFrontDoor: retryResult.semanticFrontDoor,
              frontDoorBlocked: true,
            };
          }
          bundleText = retryResult.final_context_bundle_canonical ?? '';
          logInfo('RAG', 'getContextRN retry completed', {
            bundleChars: bundleText.length,
          });
        } catch {
          // ignore
        }
      }
      if (!bundleText?.trim()) {
        logWarn('RAG', 'deterministic context returned empty bundle', {
          questionChars: question.length,
          questionPreview:
            question.length <= 80 ? question : `${question.slice(0, 77)}...`,
          packRootPresent: !!packRoot,
        });
        throw ragErrorWithAttribution(
          'E_RETRIEVAL',
          'Deterministic context provider returned empty bundle.',
          CONTEXT_RETRIEVAL_EMPTY,
        );
      }
      options?.onRetrievalComplete?.();
      mark('context build start');
      const prompt = buildPrompt(bundleText, question);
      mark('context build end');
      if (requestId != null && requestDebugSink) {
        emitRag('rag_retrieval_mode', { retrievalMode: 'deterministic' });
        emitRag('rag_context_bundle_selected', {
          contextLength: bundleText.length,
          bundleId,
          ruleSetId,
          rulesCount: bundleRulesCount,
          cardsCount: bundleCardsCount,
          bundlePreview:
            bundleText.slice(0, BUNDLE_PREVIEW_MAX) +
            (bundleText.length > BUNDLE_PREVIEW_MAX ? '…' : ''),
        });
        emitRag('rag_context_assembled', {
          contextLength: bundleText.length,
          bundleId,
          ruleSetId,
          rulesCount: bundleRulesCount,
          cardsCount: bundleCardsCount,
          bundlePreview:
            bundleText.slice(0, BUNDLE_PREVIEW_MAX) +
            (bundleText.length > BUNDLE_PREVIEW_MAX ? '…' : ''),
        });
        emitRag('rag_retrieval_complete', {
          retrievalMode: 'deterministic',
          contextLength: bundleText.length,
          bundleId,
          ruleSetId,
          rulesCount: bundleRulesCount,
          cardsCount: bundleCardsCount,
          bundlePreview:
            bundleText.slice(0, BUNDLE_PREVIEW_MAX) +
            (bundleText.length > BUNDLE_PREVIEW_MAX ? '…' : ''),
        });
        emitRag('rag_prompt_built', {
          promptLength: prompt.length,
          contextLength: bundleText.length,
          rulesCount: bundleRulesCount,
          cardsCount: bundleCardsCount,
          promptPreview:
            prompt.slice(0, PROMPT_PREVIEW_MAX) +
            (prompt.length > PROMPT_PREVIEW_MAX ? '…' : ''),
          promptHash: simplePromptHash(prompt),
        });
      }
      logInfo('RAG', 'prompt built from deterministic bundle', {
        bundleChars: bundleText.length,
        promptChars: prompt.length,
      });
      if (!params.chatModelPath?.trim()) {
        throw ragError(
          'E_MODEL_PATH',
          'chatModelPath required for deterministic path.',
        );
      }
      const chatContextWasWarm = !!chatContext;
      options?.onModelLoadStart?.();
      mark('chat model load start');
      if (requestId != null && requestDebugSink) {
        emitRag('rag_model_load_start', {
          modelPath: params.chatModelPath ?? undefined,
          cold: !chatContextWasWarm,
        });
      }
      const chatCtx = await getChatContext(params.chatModelPath);
      mark('chat model load end');
      if (requestId != null && requestDebugSink) {
        emitRag('rag_model_load_end', {
          modelPath: params.chatModelPath ?? undefined,
          cold: !chatContextWasWarm,
        });
      }
      if (requestId != null && requestDebugSink) {
        emitRag('rag_generation_request_start', {
          modelPath: params.chatModelPath ?? undefined,
          ...generationTelemetryParams(),
        });
      }
      options?.onGenerationStart?.();
      if (requestId != null && requestDebugSink) {
        emitRag('rag_inference_start', {});
      }
      mark('completion start');
      const completionStartedAt = Date.now();
      let completionTotalTokens: number | undefined;
      if (options?.onPartial) {
        let streamBuffer = '';
        let firstTokenEmitted = false;
        let lastStreamEmitAt = 0;
        const completionResult = await chatCtx.completion(
          {
            prompt,
            n_predict: RAG_CONFIG.n_predict,
            stop: LLAMA3_STOP_SEQUENCES,
            ...RAG_CONFIG.generation,
          },
          (data: { token?: string; text?: string }) => {
            const chunk = data?.token ?? data?.text ?? '';
            if (chunk) {
              streamBuffer += chunk;
              if (requestId != null && requestDebugSink) {
                if (!firstTokenEmitted) {
                  firstTokenEmitted = true;
                  emitRag('rag_first_token', {
                    elapsedMs: Date.now() - completionStartedAt,
                  });
                }
                const now = Date.now();
                if (now - lastStreamEmitAt >= 400) {
                  lastStreamEmitAt = now;
                  emitRag('rag_stream_update', {
                    partialLength: streamBuffer.length,
                    elapsedMs: now - completionStartedAt,
                  });
                }
              }
              options.onPartial?.(streamBuffer);
            }
          },
        );
        completionTotalTokens = extractTotalTokens(completionResult);
        raw =
          streamBuffer ||
          completionResult?.text ||
          (completionResult as { content?: string })?.content ||
          '';
      } else {
        const completionResult = await chatCtx.completion({
          prompt,
          n_predict: RAG_CONFIG.n_predict,
          stop: LLAMA3_STOP_SEQUENCES,
          ...RAG_CONFIG.generation,
        });
        completionTotalTokens = extractTotalTokens(completionResult);
        raw =
          completionResult?.text ??
          (completionResult as { content?: string })?.content ??
          '';
      }
      mark('completion end');
      if (requestId != null && requestDebugSink) {
        emitRag('rag_generation_complete', {
          finalLength: raw.length,
          totalTokens: completionTotalTokens,
          generationTimeMs: Date.now() - completionStartedAt,
        });
      }
      return {
        raw,
        contextText: bundleText,
        intent: 'unknown',
        contextSelection,
      };
    }
    if (!params.embedModelPath?.trim() || !params.chatModelPath?.trim()) {
      throw ragError(
        'E_MODEL_PATH',
        'On-device models not configured. Set embedModelPath and chatModelPath to local GGUF file paths (e.g. in app documents or bundled assets). Pack expects an embed model matching index dim (e.g. nomic-embed-text) and a chat model for completion.',
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
      throw ragError(
        'E_MODEL_PATH',
        `Embed model load failed: ${msg} Path: ${params.embedModelPath}`,
      );
    }

    mark('embedding start');
    const embRes = await embedCtx.embedding(question);
    queryVec = new Float32Array(embRes.embedding);
    if (queryVec.length !== rulesMeta.dim) {
      throw ragError(
        'E_EMBED_MISMATCH',
        `Query embedding dim ${queryVec.length} !== index dim ${rulesMeta.dim}`,
      );
    }
    mark('embedding end');

    mark('vectors load start');
    const [rulesIndex, cardsIndex] = await Promise.all([
      loadVectors(reader, packState.rules.vectorsPath, rulesMeta, 'rules'),
      loadVectors(reader, packState.cards.vectorsPath, cardsMeta, 'cards'),
    ]);
    mark('vectors load end');

    mark('retrieval start');
    const rulesTopK = Math.min(
      RAG_CONFIG.retrieval.top_k_rules,
      rulesIndex.nRows,
    );
    const cardsTopK = Math.min(
      RAG_CONFIG.retrieval.top_k_cards,
      cardsIndex.nRows,
    );
    const rulesHits = searchL2(rulesIndex, queryVec, rulesTopK);
    const cardsHits = searchL2(cardsIndex, queryVec, cardsTopK);
    const merged = mergeHits(rulesHits, cardsHits);
    const topMerged = merged.slice(0, RAG_CONFIG.retrieval.top_k_merge);
    mark('retrieval end');

    const rulesRowIds = topMerged
      .filter(h => h.source_type === 'rules')
      .map(h => h.rowId);
    const cardsRowIds = topMerged
      .filter(h => h.source_type === 'cards')
      .map(h => h.rowId);
    mark('chunks load start');
    const [rulesChunks, cardsChunks] = await Promise.all([
      loadChunksForRows(reader, packState.rules.chunksPath, rulesRowIds),
      loadChunksForRows(reader, packState.cards.chunksPath, cardsRowIds),
    ]);
    mark('chunks load end');

    mark('context build start');
    const chunksForPrompt = topMerged.map(h => {
      const map = h.source_type === 'rules' ? rulesChunks : cardsChunks;
      const c = map.get(h.rowId);
      return {
        doc_id: c?.doc_id ?? h.doc_id,
        source_type: h.source_type,
        title: c?.title,
        text: c?.text,
      };
    });
    options?.onRetrievalComplete?.();
    const { prompt, contextBlock } = trimChunksToFitPrompt(
      chunksForPrompt,
      question,
    );
    mark('context build end');
    if (requestId != null && requestDebugSink) {
      emitRag('rag_context_bundle_selected', {
        contextLength: contextBlock.length,
        rulesCount: rulesRowIds.length,
        cardsCount: cardsRowIds.length,
        bundlePreview:
          contextBlock.slice(0, BUNDLE_PREVIEW_MAX) +
          (contextBlock.length > BUNDLE_PREVIEW_MAX ? '…' : ''),
      });
      emitRag('rag_context_assembled', {
        contextLength: contextBlock.length,
        rulesCount: rulesRowIds.length,
        cardsCount: cardsRowIds.length,
        bundlePreview:
          contextBlock.slice(0, BUNDLE_PREVIEW_MAX) +
          (contextBlock.length > BUNDLE_PREVIEW_MAX ? '…' : ''),
      });
      emitRag('rag_retrieval_complete', {
        retrievalMode: 'vector',
        contextLength: contextBlock.length,
        rulesCount: rulesRowIds.length,
        cardsCount: cardsRowIds.length,
        bundlePreview:
          contextBlock.slice(0, BUNDLE_PREVIEW_MAX) +
          (contextBlock.length > BUNDLE_PREVIEW_MAX ? '…' : ''),
      });
      emitRag('rag_prompt_built', {
        promptLength: prompt.length,
        contextLength: contextBlock.length,
        rulesCount: rulesRowIds.length,
        cardsCount: cardsRowIds.length,
        promptPreview:
          prompt.slice(0, PROMPT_PREVIEW_MAX) +
          (prompt.length > PROMPT_PREVIEW_MAX ? '…' : ''),
        promptHash: simplePromptHash(prompt),
      });
    }

    logDebugPromptAndChunks(
      chunksForPrompt,
      prompt,
      RAG_CONFIG.generation,
      params.chatModelPath ?? '(none)',
    );

    const chatContextWasWarm = !!chatContext;
    options?.onModelLoadStart?.();
    mark('chat model load start');
    let chatCtx: import('llama.rn').LlamaContext;
    try {
      if (requestId != null && requestDebugSink) {
        emitRag('rag_model_load_start', {
          modelPath: params.chatModelPath ?? undefined,
          cold: !chatContextWasWarm,
        });
      }
      chatCtx = await getChatContext(params.chatModelPath);
      mark('chat model load end');
      if (requestId != null && requestDebugSink) {
        emitRag('rag_model_load_end', {
          modelPath: params.chatModelPath ?? undefined,
          cold: !chatContextWasWarm,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      mark('chat model load failed');
      throw ragError(
        'E_MODEL_PATH',
        `Chat model load failed: ${msg} Path: ${params.chatModelPath}`,
      );
    }

    if (requestId != null && requestDebugSink) {
      emitRag('rag_generation_request_start', {
        modelPath: params.chatModelPath ?? undefined,
        ...generationTelemetryParams(),
      });
    }
    options?.onGenerationStart?.();
    if (requestId != null && requestDebugSink) {
      emitRag('rag_inference_start', {});
    }
    mark('completion start');
    const completionStartedAt = Date.now();
    let completionTotalTokens: number | undefined;
    if (options?.onPartial) {
      let streamBuffer = '';
      const result = await chatCtx.completion(
        {
          prompt,
          n_predict: RAG_CONFIG.n_predict,
          stop: LLAMA3_STOP_SEQUENCES,
          ...RAG_CONFIG.generation,
        },
        (data: { token?: string; text?: string }) => {
          const chunk = data?.token ?? data?.text ?? '';
          if (chunk) {
            streamBuffer += chunk;
            options.onPartial?.(streamBuffer);
          }
        },
      );
      completionTotalTokens = extractTotalTokens(result);
      raw = streamBuffer || (result?.text ?? result?.content ?? '');
    } else {
      const result = await chatCtx.completion({
        prompt,
        n_predict: RAG_CONFIG.n_predict,
        stop: LLAMA3_STOP_SEQUENCES,
        ...RAG_CONFIG.generation,
      });
      completionTotalTokens = extractTotalTokens(result);
      raw = result?.text ?? result?.content ?? '';
    }
    mark('completion end');
    if (requestId != null && requestDebugSink) {
      emitRag('rag_generation_complete', {
        finalLength: raw.length,
        totalTokens: completionTotalTokens,
        generationTimeMs: Date.now() - completionStartedAt,
      });
    }
  }

  return { raw, intent: 'unknown' };
}

function mergeHits(
  rulesHits: Array<{ rowId: number; score: number }>,
  cardsHits: Array<{ rowId: number; score: number }>,
): Array<{
  rowId: number;
  score: number;
  source_type: 'rules' | 'cards';
  doc_id: string;
}> {
  const out: Array<{
    rowId: number;
    score: number;
    source_type: 'rules' | 'cards';
    doc_id: string;
  }> = [];
  const rMax = rulesHits.length ? Math.max(...rulesHits.map(h => h.score)) : 1;
  const cMax = cardsHits.length ? Math.max(...cardsHits.map(h => h.score)) : 1;
  const rNorm = (s: number) => (rMax > 0 ? s / rMax : 0);
  const cNorm = (s: number) => (cMax > 0 ? s / cMax : 0);
  const rulesWithDocId = rulesHits.map(h => ({
    ...h,
    source_type: 'rules' as const,
    doc_id: `rules:${h.rowId}`,
    normScore: RAG_CONFIG.retrieval.rules_weight * (1 - rNorm(h.score)),
  }));
  const cardsWithDocId = cardsHits.map(h => ({
    ...h,
    source_type: 'cards' as const,
    doc_id: `cards:${h.rowId}`,
    normScore: RAG_CONFIG.retrieval.cards_weight * (1 - cNorm(h.score)),
  }));
  const all = [...rulesWithDocId, ...cardsWithDocId];
  all.sort((a, b) => b.normScore - a.normScore);
  for (const h of all) {
    out.push({
      rowId: h.rowId,
      score: h.score,
      source_type: h.source_type,
      doc_id: h.doc_id,
    });
  }
  return out;
}
