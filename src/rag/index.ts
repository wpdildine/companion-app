/**
 * RAG integration layer: init, pack load, ask (embed → retrieve → complete → validate).
 * In this app version (RAG_USE_DETERMINISTIC_CONTEXT_ONLY) embeddings are not present;
 * the canonical path is deterministic context provider + LLM format/summarize only.
 * See plan: Ollama RAG and validation.
 */

import { ragError } from './errors';
import { loadPack } from './loadPack';
import type { PackFileReader, PackState, RagInitParams } from './types';

export { applyPackRagConfig, RAG_CONFIG } from './config';
export type { PackRagConfig, RagConfig } from './config';
export {
  CONTEXT_BUNDLE_ERROR,
  CONTEXT_RETRIEVAL_EMPTY,
  ragError,
  ragErrorWithAttribution,
  readAttributionErrorKind,
} from './errors';
export type { RagErrorCode } from './errors';
export {
  getPackEmbedModelId,
  PACK_EMBED_MODEL_ID_DETERMINISTIC_ONLY,
} from './loadPack';
export {
  BUNDLE_PACK_ROOT,
  copyBundlePackToDocuments,
  createBundlePackReader,
  createDocumentsPackReader,
  createThrowReader,
  getContentPackPathInDocuments,
} from './packFileReader';
export { RAG_USE_DETERMINISTIC_CONTEXT_ONLY } from './types';
export type { PackFileReader, PackState, RagInitParams } from './types';
export type { ValidationSummary } from './validate';

import type { FailureIntent, SemanticFrontDoor } from '@atlas/runtime';
import {
  classifyRepairFollowUp,
  type RepairFollowUpKind,
} from './repairFollowUp';
import {
  failureIntentFromSettledNudgedText,
  runHumanShortPipeline,
  runPipelineHumanShort,
} from '@atlas/runtime';
import type { ValidationSummary } from './validate';
import { normalizeOracleText } from './normalizeOracleText';

/** Payload shape for request-debug sink (same contract as app requestDebugStore.emit). */
export type RequestDebugSinkPayload = {
  type: string;
  requestId: number | null;
  timestamp?: number;
  [key: string]: unknown;
};

export interface RagInitOptions {
  /** Optional request-debug sink; init emits rag_init_* and pack telemetry with requestId: null. */
  requestDebugSink?: (payload: RequestDebugSinkPayload) => void;
}

/** Options for ask(). */
export interface AskOptions {
  signal?: AbortSignal;
  /** When true, skip nudgeResponse (return raw as nudged, empty validation). Use to match CLI/local output for debugging. */
  debugSkipNudge?: boolean;
  /** Called with full accumulated text as generation streams; UI should replace (not append) to avoid duplicate tokens. */
  onPartial?: (accumulatedText: string) => void;
  /** Request id from orchestrator; when set with requestDebugSink, RAG emits telemetry into the same store. */
  requestId?: number;
  /** Sink for request-scoped debug telemetry; receives events with type, requestId, timestamp, and payload. */
  requestDebugSink?: (payload: RequestDebugSinkPayload) => void;
  /** Called once when retrieval/context assembly is done, before prompt build. */
  onRetrievalComplete?: () => void;
  /** Called once immediately before loading the chat model (not used on Ollama/non-local path). */
  onModelLoadStart?: () => void;
  /** Called once immediately before starting model inference. */
  onGenerationStart?: () => void;
  /** Called once after runRagFlow returns, before nudgeResponse (post-generation validation). */
  onValidationStart?: () => void;
  /**
   * When set, ask() classifies follow-up vs a runtime-proposed repair (RAG seam; no pack init).
   */
  pendingRepairCandidate?: { repairedQuery: string; requestId: number };
}

/** Result of ask(question). */
export interface AskResult {
  raw: string;
  nudged: string;
  validationSummary: ValidationSummary;
  /** Deterministic path stopped at semantic front door (no LLM / no retrieval misuse). */
  frontDoorBlocked?: boolean;
  semanticFrontDoor?: SemanticFrontDoor;
  /** Runtime-owned; mirrors `semanticFrontDoor.failure_intent` when front-blocked, else from settle sentinel. */
  failure_intent?: FailureIntent | null;
  /** Set when pendingRepairCandidate classification runs (runtime seam). */
  repairFollowUp?: RepairFollowUpKind;
}

/** Set to true to disable nudge globally (for debugging prompt/chunks vs CLI). */
export let RAG_DEBUG_SKIP_NUDGE = false;

let packState: PackState | null = null;
let initParams: RagInitParams | null = null;
let fileReader: PackFileReader | null = null;

/** Guard: only one ask() at a time to avoid concurrent inference and duplicate class issues. */
let askInFlight = false;

const EMPTY_ASK_VALIDATION_SUMMARY: ValidationSummary = {
  cards: [],
  rules: [],
  stats: {
    cardHitRate: 0,
    ruleHitRate: 0,
    unknownCardCount: 0,
    invalidRuleCount: 0,
  },
};

export type { RepairFollowUpKind } from './repairFollowUp';

function appendSelectedContext(
  summary: ValidationSummary,
  contextSelection?: {
    cards: Array<{ name: string; doc_id?: string; oracleText?: string }>;
    rules: Array<{ rule_id: string; title?: string; excerpt?: string }>;
  },
): ValidationSummary {
  if (!contextSelection) return summary;

  const cards = [...summary.cards];
  const rules = [...summary.rules];
  const seenCards = new Set(
    cards.map(
      card =>
        `${card.doc_id ?? ''}::${(card.canonical ?? card.raw).toLowerCase()}`,
    ),
  );
  const seenRules = new Set(
    rules.map(rule => (rule.canonical ?? rule.raw).toLowerCase()),
  );

  for (const card of contextSelection.cards) {
    const key = `${card.doc_id ?? ''}::${card.name.toLowerCase()}`;
    const existingIndex = cards.findIndex(
      existing =>
        `${existing.doc_id ?? ''}::${(
          existing.canonical ?? existing.raw
        ).toLowerCase()}` === key,
    );
    if (existingIndex >= 0) {
      const existing = cards[existingIndex]!;
      cards[existingIndex] = {
        ...existing,
        canonical: existing.canonical ?? card.name,
        doc_id: existing.doc_id ?? card.doc_id,
        oracleText: existing.oracleText ?? card.oracleText,
        status: existing.status === 'in_pack' ? existing.status : 'in_pack',
      };
      continue;
    }
    seenCards.add(key);
    cards.push({
      raw: card.name,
      canonical: card.name,
      doc_id: card.doc_id,
      oracleText: card.oracleText,
      status: 'in_pack',
    });
  }

  for (const rule of contextSelection.rules) {
    const key = rule.rule_id.toLowerCase();
    if (seenRules.has(key)) continue;
    seenRules.add(key);
    rules.push({
      raw: rule.rule_id,
      canonical: rule.rule_id,
      title: rule.title ?? rule.rule_id,
      excerpt: rule.excerpt ?? rule.rule_id,
      status: 'valid',
    });
  }

  return {
    ...summary,
    cards,
    rules,
  };
}

function dedupeValidationSummary(
  summary: ValidationSummary,
): ValidationSummary {
  const dedupedCards = new Map<string, ValidationSummary['cards'][number]>();
  for (const card of summary.cards) {
    const key = `${card.doc_id ?? ''}::${(card.canonical ?? card.raw)
      .trim()
      .toLowerCase()}`;
    const existing = dedupedCards.get(key);
    if (!existing) {
      dedupedCards.set(key, card);
      continue;
    }
    dedupedCards.set(key, {
      ...existing,
      doc_id: existing.doc_id ?? card.doc_id,
      canonical: existing.canonical ?? card.canonical,
      oracleText: existing.oracleText ?? card.oracleText,
      status: existing.status === 'in_pack' ? existing.status : card.status,
    });
  }

  const dedupedRules = new Map<string, ValidationSummary['rules'][number]>();
  for (const rule of summary.rules) {
    const key = (rule.canonical ?? rule.raw).trim().toLowerCase();
    const existing = dedupedRules.get(key);
    if (!existing) {
      dedupedRules.set(key, rule);
      continue;
    }
    dedupedRules.set(key, {
      ...existing,
      canonical: existing.canonical ?? rule.canonical,
      title: existing.title ?? rule.title,
      excerpt: existing.excerpt ?? rule.excerpt,
      status: existing.status === 'valid' ? existing.status : rule.status,
    });
  }

  return {
    ...summary,
    cards: Array.from(dedupedCards.values()),
    rules: Array.from(dedupedRules.values()),
  };
}

function extractCardOracleText(
  contextText: string | undefined,
  cardName: string,
): string | null {
  if (!contextText?.trim()) return null;
  const escapedName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = contextText.match(
    new RegExp(`\\[Card: ${escapedName}\\]\\n([^\\n]+)`, 'i'),
  );
  return match?.[1]?.trim() ?? null;
}

function formatCardEffectAnswer(cardName: string, oracleText: string): string {
  const cleaned = normalizeOracleText(oracleText.replace(/\s+/g, ' ').trim().replace(/[.]+$/, ''));
  const areMatch = cleaned.match(/^(.+?) are (.+)$/i);
  if (areMatch) {
    const subject = areMatch[1]?.trim().toLowerCase();
    const predicate = areMatch[2]?.trim();
    if (subject && predicate)
      return `${cardName} turns ${subject} into ${predicate}.`;
  }
  const isMatch = cleaned.match(/^(.+?) is (.+)$/i);
  if (isMatch) {
    const subject = isMatch[1]?.trim().toLowerCase();
    const predicate = isMatch[2]?.trim();
    if (subject && predicate)
      return `${cardName} makes ${subject} ${predicate}.`;
  }
  return `${cardName}: ${cleaned}.`;
}

function maybeSanitizeCardEffectAnswer(
  question: string,
  text: string,
  contextText: string | undefined,
  contextSelection?: {
    cards: Array<{ name: string; doc_id?: string; oracleText?: string }>;
    rules: Array<{ rule_id: string; title?: string; excerpt?: string }>;
  },
): string {
  const normalizedQuestion = question.trim().toLowerCase();
  if (!/^what does .+ do\??$/.test(normalizedQuestion)) return text;
  if ((contextSelection?.cards.length ?? 0) !== 1) return text;
  const cardName = contextSelection!.cards[0]!.name;
  const oracleText = extractCardOracleText(contextText, cardName);
  if (!oracleText) return text;
  return formatCardEffectAnswer(cardName, oracleText);
}

/**
 * Initialize the RAG layer: load pack, validate capability, enforce embed_model_id.
 * Call with a PackFileReader that reads paths relative to packRoot (e.g. from app document dir or assets).
 * Idempotent: if already initialized with the same pack root, returns existing state without reloading.
 */
export async function init(
  params: RagInitParams,
  reader: PackFileReader,
  options?: RagInitOptions,
): Promise<PackState> {
  const t0 = Date.now();
  const mark = (msg: string) =>
    console.log(`[RAG][${Date.now() - t0}ms] ${msg}`);
  mark('init start');
  const emitInit = (type: string, payload?: Record<string, unknown>) => {
    options?.requestDebugSink?.({
      type,
      requestId: null,
      timestamp: Date.now(),
      ...(payload ?? {}),
    });
  };
  emitInit('rag_init_start');
  if (
    packState &&
    initParams &&
    fileReader &&
    initParams.packRoot === params.packRoot
  ) {
    mark('init end (cached)');
    emitInit('rag_init_end', { cached: true });
    return packState;
  }
  const state = await loadPack(reader, params, (type, payload) =>
    emitInit(type, payload),
  );
  emitInit('rag_pack_identity', {
    packRoot: params.packRoot ?? undefined,
    embedModelId: params.embedModelId ?? undefined,
    chatModelPath: params.chatModelPath ?? undefined,
  });
  mark('init end (pack loaded)');
  emitInit('rag_init_end');
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
  options?: AskOptions,
): Promise<AskResult> {
  if (!packState || !fileReader || !initParams) {
    throw ragError(
      'E_NOT_INITIALIZED',
      'RAG layer not initialized; call init() first.',
    );
  }
  if (askInFlight) {
    throw ragError(
      'E_RETRIEVAL',
      'Another ask is already in progress. Wait for it to finish.',
    );
  }
  const skipNudge = options?.debugSkipNudge ?? RAG_DEBUG_SKIP_NUDGE;
  askInFlight = true;
  try {
    if (options?.pendingRepairCandidate) {
      const kind = classifyRepairFollowUp(
        _question,
        options.pendingRepairCandidate.repairedQuery,
      );
      return {
        raw: '',
        nudged: '',
        validationSummary: EMPTY_ASK_VALIDATION_SUMMARY,
        frontDoorBlocked: true,
        repairFollowUp: kind,
      };
    }
    const normalizeHumanShortLines = (text: string): string => {
      const lines = (text ?? '')
        .split('\n')
        .map(ln => ln.trim())
        .filter(ln => ln.length > 0)
        .map(ln => ln.replace(/^(?:-\s+|\u2022\s*|\*\s+)/, '').trim());
      return lines.join('\n').trim();
    };
    const toHumanShort = (
      rawText: string,
      contextText?: string,
      intent?: string,
    ): string => {
      if ((contextText ?? '').trim().length > 0) {
        return normalizeOracleText(normalizeHumanShortLines(
          runPipelineHumanShort(
            rawText,
            contextText ?? '',
            _question,
            intent ?? 'unknown',
          ).finalText,
        ));
      }
      return normalizeOracleText(normalizeHumanShortLines(runHumanShortPipeline(rawText)));
    };
    const { runRagFlow } = require('./ask') as typeof import('./ask');
    const result = await runRagFlow(
      packState,
      initParams,
      fileReader,
      _question,
      options,
    );
    if (result.frontDoorBlocked && result.semanticFrontDoor) {
      const fd = result.semanticFrontDoor;
      // Match executeRequest: runtime verdict proceed_to_retrieval is not re-blocked here.
      if (fd.front_door_verdict !== 'proceed_to_retrieval') {
        return {
          raw: '',
          nudged: '',
          validationSummary: {
            cards: [],
            rules: [],
            stats: {
              cardHitRate: 0,
              ruleHitRate: 0,
              unknownCardCount: 0,
              invalidRuleCount: 0,
            },
          },
          frontDoorBlocked: true,
          semanticFrontDoor: fd,
          failure_intent: fd.failure_intent,
        };
      }
    }
    if (skipNudge) {
      const nudgedText = maybeSanitizeCardEffectAnswer(
        _question,
        toHumanShort(result.raw, result.contextText, result.intent),
        result.contextText,
        result.contextSelection,
      );
      const failure_intent = failureIntentFromSettledNudgedText(nudgedText);
      return {
        raw: result.raw,
        nudged: nudgedText,
        validationSummary: dedupeValidationSummary(
          appendSelectedContext(
            {
              cards: [],
              rules: [],
              stats: {
                cardHitRate: 0,
                ruleHitRate: 0,
                unknownCardCount: 0,
                invalidRuleCount: 0,
              },
            },
            result.contextSelection,
          ),
        ),
        failure_intent,
      };
    }
    options?.onValidationStart?.();
    const validateModule = require('./validate') as typeof import('./validate');
    const nudgeResult = await validateModule.nudgeResponse(
      result.raw,
      packState,
      fileReader,
    );
    const nudgedText = maybeSanitizeCardEffectAnswer(
      _question,
      toHumanShort(nudgeResult.nudgedText, result.contextText, result.intent),
      result.contextText,
      result.contextSelection,
    );
    const failure_intent = failureIntentFromSettledNudgedText(nudgedText);
    return {
      raw: result.raw,
      nudged: nudgedText,
      validationSummary: dedupeValidationSummary(
        appendSelectedContext(nudgeResult.summary, result.contextSelection),
      ),
      failure_intent,
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
