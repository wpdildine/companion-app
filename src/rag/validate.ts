/**
 * Post-generation validation: load validate sidecars, extract mentions, validate, nudge.
 * Uses manifest.sidecars.capabilities.validate.files.*.path only.
 */

import type { PackState, PackFileReader } from './types';

export interface ValidationSummary {
  cards: {
    raw: string;
    canonical?: string;
    doc_id?: string;
    status: 'in_pack' | 'alias' | 'unknown';
  }[];
  rules: { raw: string; canonical?: string; status: 'valid' | 'invalid' }[];
  stats: {
    cardHitRate: number;
    ruleHitRate: number;
    unknownCardCount: number;
    invalidRuleCount: number;
  };
}

/** Name lookup row (name_lookup.jsonl). */
interface NameLookupRow {
  doc_id: string;
  oracle_id?: string;
  name?: string;
  aliases?: string[];
  norm: string;
  aliases_norm: string[];
}

/** Rule IDs payload (rule_ids.json). */
interface RuleIdsPayload {
  rule_ids: string[];
  count?: number;
}

const RULE_ID_REGEX = /\b\d{3}(?:\.\d+)*(?:[a-z])?\b/g;
const MIN_CARD_NAME_LENGTH = 4;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[-''":(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word boundary: not a word char (ASCII \w for contract simplicity). */
function isWordBoundary(c: string): boolean {
  return !/[\w]/.test(c);
}

export function extractRuleMentions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  RULE_ID_REGEX.lastIndex = 0;
  while ((m = RULE_ID_REGEX.exec(text)) !== null) {
    const id = m[0];
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Find card mention spans in text (normalized). Normalize text first; match against norm/aliases_norm; longest match, min length 4. */
function findCardMentions(
  normalizedText: string,
  normToCanonical: Map<string, { name: string; doc_id: string }>
): Array<{ raw: string; canonical: string; doc_id: string; start: number; end: number }> {
  const results: Array<{ raw: string; canonical: string; doc_id: string; start: number; end: number }> = [];
  const sortedNorms = Array.from(normToCanonical.keys()).sort((a, b) => b.length - a.length);
  let pos = 0;
  while (pos < normalizedText.length) {
    let matched: { norm: string; canonical: string; doc_id: string } | null = null;
    for (const norm of sortedNorms) {
      if (norm.length < MIN_CARD_NAME_LENGTH) continue;
      const nextStart = pos + norm.length;
      const slice = normalizedText.slice(pos, nextStart);
      if (slice !== norm) continue;
      const beforeOk = pos === 0 || isWordBoundary(normalizedText[pos - 1]!);
      const afterOk = nextStart >= normalizedText.length || isWordBoundary(normalizedText[nextStart]!);
      if (beforeOk && afterOk) {
        const rec = normToCanonical.get(norm)!;
        matched = { norm, canonical: rec.name, doc_id: rec.doc_id };
        break;
      }
    }
    if (matched) {
      results.push({
        raw: matched.norm,
        canonical: matched.canonical,
        doc_id: matched.doc_id,
        start: pos,
        end: pos + matched.norm.length,
      });
      pos += matched.norm.length;
    } else {
      pos += 1;
    }
  }
  return results;
}

async function loadRuleIds(reader: PackFileReader, path: string): Promise<Set<string>> {
  const raw = await reader.readFile(path);
  const data = JSON.parse(raw) as RuleIdsPayload;
  const arr = data.rule_ids ?? [];
  return new Set(arr);
}

async function loadNameLookup(
  reader: PackFileReader,
  path: string
): Promise<Map<string, { name: string; doc_id: string }>> {
  const raw = await reader.readFile(path);
  const lines = raw.split('\n').filter((l) => l.trim());
  const normToCanonical = new Map<string, { name: string; doc_id: string }>();
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as NameLookupRow;
      const canonicalName = row.name ?? row.norm ?? '';
      const docId = row.doc_id ?? '';
      if (row.norm) {
        normToCanonical.set(row.norm, { name: canonicalName, doc_id: docId });
      }
      const aliases = row.aliases_norm ?? [];
      for (const a of aliases) {
        if (a && !normToCanonical.has(a)) {
          normToCanonical.set(a, { name: canonicalName, doc_id: docId });
        }
      }
    } catch {
      // skip malformed lines
    }
  }
  return normToCanonical;
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
  const [validRuleIds, normToCanonical] = await Promise.all([
    loadRuleIds(reader, packState.validate.rulesRuleIdsPath),
    loadNameLookup(reader, packState.validate.cardsNameLookupPath),
  ]);
  mark('rule_ids loaded end');
  mark('name_lookup loaded end');

  const normalizedInput = normalize(rawText);
  const ruleMentions = extractRuleMentions(rawText);
  const cardMentions = findCardMentions(normalizedInput, normToCanonical);

  const rulesSummary = ruleMentions.map((raw) => {
    const valid = validRuleIds.has(raw);
    return { raw, status: (valid ? 'valid' : 'invalid') as 'valid' | 'invalid' };
  });

  const cardsSummary = cardMentions.map((m) => ({
    raw: m.raw,
    canonical: m.canonical,
    doc_id: m.doc_id,
    status: 'in_pack' as const,
  }));

  const unknownCardRaw = new Set<string>();
  const normalizedWords = normalizedInput.split(/\s+/);
  for (const w of normalizedWords) {
    if (w.length >= MIN_CARD_NAME_LENGTH && !normToCanonical.has(w)) {
      if (/^\d/.test(w)) continue;
      unknownCardRaw.add(w);
    }
  }
  for (const r of cardsSummary) {
    unknownCardRaw.delete(r.raw);
  }
  const unknownCards = Array.from(unknownCardRaw).map((raw) => ({
    raw,
    status: 'unknown' as const,
  }));

  const allCards = [...cardsSummary, ...unknownCards];
  const validRuleCount = rulesSummary.filter((r) => r.status === 'valid').length;
  const invalidRuleCount = rulesSummary.length - validRuleCount;
  const unknownCardCount = unknownCards.length;
  const cardHitRate = allCards.length ? (cardsSummary.length / allCards.length) : 1;
  const ruleHitRate = rulesSummary.length ? validRuleCount / rulesSummary.length : 1;

  let nudgedText = rawText;
  const replaced = new Set<string>();
  const sortedNorms = Array.from(normToCanonical.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const [norm, { name: canonical }] of sortedNorms) {
    if (norm.length < MIN_CARD_NAME_LENGTH) continue;
    if (canonical === norm || replaced.has(norm)) continue;
    const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + escaped + '\\b', 'gi');
    if (re.test(nudgedText)) {
      nudgedText = nudgedText.replace(re, canonical);
      replaced.add(norm);
    }
  }

  const summary: ValidationSummary = {
    cards: allCards.map((c) => ({
      raw: c.raw,
      canonical: 'canonical' in c ? c.canonical : undefined,
      doc_id: 'doc_id' in c ? c.doc_id : undefined,
      status: c.status,
    })),
    rules: rulesSummary.map((r) => ({ raw: r.raw, status: r.status })),
    stats: {
      cardHitRate,
      ruleHitRate,
      unknownCardCount,
      invalidRuleCount,
    },
  };

  return { nudgedText, summary };
}

