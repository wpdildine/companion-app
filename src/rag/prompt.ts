/**
 * Prompt builder: structured rules/cards excerpts with doc_id, source_type, title.
 */

import type { RetrievalHit } from './types';

export interface ChunkForPrompt {
  doc_id: string;
  source_type: 'rules' | 'cards';
  title?: string;
  text?: string;
}

/** Default max context characters for mobile (~500–700 tokens). */
export const DEFAULT_MAX_CONTEXT_CHARS = 12_000;

/** Hard cap on prompt size so we stay under n_ctx (e.g. 1024) with room for generation. ~850 tokens ≈ 3400 chars. */
export const MAX_PROMPT_CHARS = 3400;

/** Rough chars-per-token for prompt sizing. */
export const CHARS_PER_TOKEN_EST = 4;

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
 * Build full prompt: system + context + user question.
 */
export function buildPrompt(contextBlock: string, question: string): string {
  const system = 'Answer based only on the provided rules and card excerpts. Cite doc_id when you use a specific excerpt.';
  return `${system}\n\n${contextBlock}\n\nQuestion: ${question}\n\nAnswer:`;
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
