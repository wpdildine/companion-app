/**
 * Post-generation validation: load validate sidecars, extract mentions, validate, nudge.
 * Uses manifest.sidecars.capabilities.validate.files.*.path only.
 *
 * Pack policy (name_lookup promotion flags) is authoritative; mention extraction and
 * alias→canonical replacement use @atlas/runtime’s single predicate
 * (isRestrictedAliasExplicitlyCardReferential) — not a second semantic resolver here.
 */

import {
  buildNameTrie,
  extractCardMentions,
  extractRuleMentions,
  normalizeForValidate,
  nudgeResponse as nudgePackResponse,
  validateCards,
  validateRules,
  type NameLookupEntry,
} from '@atlas/runtime';

import type { PackState, PackFileReader } from './types';

export interface ValidationSummary {
  cards: {
    raw: string;
    canonical?: string;
    doc_id?: string;
    oracleText?: string;
    status: 'in_pack' | 'alias' | 'unknown';
  }[];
  rules: {
    raw: string;
    canonical?: string;
    title?: string;
    excerpt?: string;
    status: 'valid' | 'invalid';
  }[];
  stats: {
    cardHitRate: number;
    ruleHitRate: number;
    unknownCardCount: number;
    invalidRuleCount: number;
  };
}

/** Rule IDs payload (rule_ids.json). */
interface RuleIdsPayload {
  rule_ids: string[];
  count?: number;
}

const MIN_CARD_NAME_LENGTH = 4;

async function loadRuleIds(reader: PackFileReader, path: string): Promise<Set<string>> {
  const raw = await reader.readFile(path);
  const data = JSON.parse(raw) as RuleIdsPayload;
  const arr = data.rule_ids ?? [];
  return new Set(arr);
}

async function loadNameLookupEntries(reader: PackFileReader, path: string): Promise<NameLookupEntry[]> {
  const raw = await reader.readFile(path);
  const lines = raw.split('\n').filter((l) => l.trim());
  const out: NameLookupEntry[] = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as NameLookupEntry;
      if (row.norm || row.name) out.push(row);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

function collectNormKeys(entries: NameLookupEntry[]): Set<string> {
  const s = new Set<string>();
  for (const e of entries) {
    if (e.norm) s.add(e.norm);
    for (const a of e.aliases_norm || []) {
      if (a) s.add(a);
    }
  }
  return s;
}

export interface NudgeResult {
  nudgedText: string;
  summary: ValidationSummary;
}

/**
 * Load validate sidecars, run validate & nudge on raw response text.
 * Returns nudged text and ValidationSummary.
 */
export async function nudgeResponse(
  rawText: string,
  packState: PackState,
  reader: PackFileReader
): Promise<NudgeResult> {
  const t0 = Date.now();
  const mark = (msg: string) => console.log(`[RAG][${Date.now() - t0}ms] ${msg}`);
  mark('nudgeResponse start');
  const [validRuleIds, entries] = await Promise.all([
    loadRuleIds(reader, packState.validate.rulesRuleIdsPath),
    loadNameLookupEntries(reader, packState.validate.cardsNameLookupPath),
  ]);
  mark('rule_ids loaded end');
  mark('name_lookup loaded end');

  const trie = buildNameTrie(entries);
  const normKeys = collectNormKeys(entries);
  const normalizedInput = normalizeForValidate(rawText);

  const cardMentions = validateCards(extractCardMentions(rawText, trie));
  const ruleMentions = validateRules(extractRuleMentions(rawText), validRuleIds);
  const { text: nudgedText, summary: packSummary } = nudgePackResponse(rawText, cardMentions, ruleMentions, {
    stripInvalid: false,
    fixAlias: true,
  });

  const unknownCardRaw = new Set<string>();
  const normalizedWords = normalizedInput.split(/\s+/);
  for (const w of normalizedWords) {
    if (w.length >= MIN_CARD_NAME_LENGTH && !normKeys.has(w)) {
      if (/^\d/.test(w)) continue;
      unknownCardRaw.add(w);
    }
  }
  for (const m of cardMentions) {
    unknownCardRaw.delete(m.norm);
  }
  const unknownCards = Array.from(unknownCardRaw).map((raw) => ({
    raw,
    status: 'unknown' as const,
  }));

  const inPackCardRows = packSummary.cards.filter(
    (c) => c.status === 'in_pack' || c.status === 'alias'
  );
  const allCards = [...inPackCardRows, ...unknownCards];
  const validRuleCount = packSummary.rules.filter((r) => r.status === 'valid').length;
  const invalidRuleCount = packSummary.rules.length - validRuleCount;
  const unknownCardCount = unknownCards.length;
  const cardHitRate = allCards.length ? inPackCardRows.length / allCards.length : 1;
  const ruleHitRate = packSummary.rules.length ? validRuleCount / packSummary.rules.length : 1;

  const summary: ValidationSummary = {
    cards: inPackCardRows.map((c) => ({
      raw: c.raw,
      canonical: c.canonicalName ?? undefined,
      doc_id: c.doc_id ?? undefined,
      oracleText: undefined,
      status: (c.status === 'alias' ? 'alias' : 'in_pack') as 'in_pack' | 'alias',
    })),
    rules: packSummary.rules.map((r) => ({
      raw: r.raw,
      canonical: undefined,
      title: undefined,
      excerpt: undefined,
      status: r.status === 'valid' ? ('valid' as const) : ('invalid' as const),
    })),
    stats: {
      cardHitRate,
      ruleHitRate,
      unknownCardCount,
      invalidRuleCount,
    },
  };

  return { nudgedText, summary };
}
