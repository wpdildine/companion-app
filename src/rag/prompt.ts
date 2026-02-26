/**
 * Prompt builder: structured rules/cards excerpts with doc_id, source_type, title.
 * Uses Llama-3 chat template (matches mtg_rules runtime when available).
 */

import type { RetrievalHit } from './types';
import { RAG_CONFIG } from './config';

/** Llama-3 chat template tokens. */
const BOS = '<|begin_of_text|>';
const START_SYSTEM = '<|start_header_id|>system<|end_header_id|>';
const START_USER = '<|start_header_id|>user<|end_header_id|>';
const START_ASSISTANT = '<|start_header_id|>assistant<|end_header_id|>';
const EOT = '<|eot_id|>';

/**
 * Build prompt using Llama-3 chat format. Not exported from @mtg/runtime RN entrypoint, so defined here.
 */
function buildLlamaHumanShortPrompt(
  contextBlock: string,
  question: string,
  systemInstruction: string
): string {
  const system = (systemInstruction ?? '').trim() || 'You are a helpful assistant.';
  const userContent = [contextBlock.trim(), `Question: ${question.trim()}`].filter(Boolean).join('\n\n');
  return `${BOS}${START_SYSTEM}\n\n${system}${EOT}\n${START_USER}\n\n${userContent}${EOT}\n${START_ASSISTANT}\n\n`;
}

export interface ChunkForPrompt {
  doc_id: string;
  source_type: 'rules' | 'cards';
  title?: string;
  text?: string;
}

/** Default max context characters for mobile (~500–700 tokens). */
export const DEFAULT_MAX_CONTEXT_CHARS = RAG_CONFIG.prompt.default_max_context_chars;

/** Hard cap on prompt size so we stay under n_ctx with room for generation. */
export const MAX_PROMPT_CHARS = RAG_CONFIG.prompt.max_prompt_chars;

/** Rough chars-per-token for prompt sizing. */
export const CHARS_PER_TOKEN_EST = RAG_CONFIG.prompt.chars_per_token_est;

/**
 * Build context string for completion: "Rules excerpts (doc_id …):" and "Cards excerpts (doc_id …):".
 * If maxChars is set, truncates from the end to stay under cap.
 */
export function buildContextBlock(
  chunks: ChunkForPrompt[],
  maxChars: number = DEFAULT_MAX_CONTEXT_CHARS
): string {
  const rules = chunks.filter((c) => c.source_type === 'rules');
  const cards = chunks.filter((c) => c.source_type === 'cards');
  const parts: string[] = [];
  if (rules.length > 0) {
    parts.push('Rules excerpts (doc_id for citation):');
    for (const c of rules) {
      const line = c.title ? `[${c.doc_id}] ${c.title}: ${c.text ?? ''}` : `[${c.doc_id}] ${c.text ?? ''}`;
      parts.push(line.trim());
    }
  }
  if (cards.length > 0) {
    parts.push('Cards excerpts (doc_id for citation):');
    for (const c of cards) {
      const line = c.title ? `[${c.doc_id}] ${c.title}: ${c.text ?? ''}` : `[${c.doc_id}] ${c.text ?? ''}`;
      parts.push(line.trim());
    }
  }
  let out = parts.join('\n\n');
  if (maxChars > 0 && out.length > maxChars) {
    out = out.slice(0, maxChars) + '\n[...truncated]';
  }
  return out;
}

/**
 * Build full prompt using Llama-3 chat template (matches mtg_rules runtime).
 */
export function buildPrompt(contextBlock: string, question: string): string {
  return buildLlamaHumanShortPrompt(contextBlock, question, RAG_CONFIG.prompt.system_instruction);
}

/**
 * Preflight: drop chunks from the end until the full prompt fits within maxPromptChars.
 * Returns { contextBlock, prompt } so completion stays under n_ctx with room for generation.
 */
export function trimChunksToFitPrompt(
  chunks: ChunkForPrompt[],
  question: string,
  maxPromptChars: number = MAX_PROMPT_CHARS
): { contextBlock: string; prompt: string } {
  let list = [...chunks];
  let contextBlock = buildContextBlock(list);
  let prompt = buildPrompt(contextBlock, question);
  while (prompt.length > maxPromptChars && list.length > 0) {
    list = list.slice(0, -1);
    contextBlock = buildContextBlock(list);
    prompt = buildPrompt(contextBlock, question);
  }
  return { contextBlock, prompt };
}
