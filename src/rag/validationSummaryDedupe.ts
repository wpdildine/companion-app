import type { ValidationSummary } from './validate';

/**
 * Deterministic key for merging/deduping card rows: trimmed lowercased canonical name,
 * falling back to raw when canonical is absent. Does not use doc_id so resolver and
 * validator paths cannot duplicate the same card under different id slots.
 */
export function canonicalCardKey(card: {
  raw: string;
  canonical?: string;
}): string {
  return (card.canonical ?? card.raw).trim().toLowerCase();
}

/**
 * Merges validation summary card rows that refer to the same canonical card.
 * Preserves first-occurrence order; merges doc_id/oracleText/status from later rows.
 */
export function dedupeValidationSummary(
  summary: ValidationSummary,
): ValidationSummary {
  const dedupedCards = new Map<string, ValidationSummary['cards'][number]>();
  for (const card of summary.cards) {
    const key = canonicalCardKey(card);
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
