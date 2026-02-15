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

/**
 * Build context string for completion: "Rules excerpts (doc_id …):" and "Cards excerpts (doc_id …):".
 */
export function buildContextBlock(chunks: ChunkForPrompt[]): string {
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
  return parts.join('\n\n');
}

/**
 * Build full prompt: system + context + user question.
 */
export function buildPrompt(contextBlock: string, question: string): string {
  const system = 'Answer based only on the provided rules and card excerpts. Cite doc_id when you use a specific excerpt.';
  return `${system}\n\n${contextBlock}\n\nQuestion: ${question}\n\nAnswer:`;
}
