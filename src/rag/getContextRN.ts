/**
 * In-app implementation of getContext for React Native when @mtg/runtime's RN entrypoint
 * does not provide it. Uses @mtg/runtime portable exports + pack DBs via react-native-quick-sqlite.
 * Requires packRoot to be a real path (e.g. Documents/content_pack) so we can open SQLite files.
 */

import type {
  ContextBundle,
  ContextProviderSpec,
  RoutingTrace,
} from '@mtg/runtime';
import {
  analyzeQuery,
  canonicalizeBundle,
  getDefinitions,
  getKeywordAbilities,
  getResolverThresholds,
  getSectionDefaults,
  getStopwords,
  loadRouterMap,
  normalize,
  route,
  tokenEst,
} from '@mtg/runtime';
import { openCardsDb, openRulesDb, type DbRow } from './packDbRN';
import type { PackFileReader } from './types';
import { RAG_CONFIG } from './config';

const SCORE_SCALE = 1_000_000;
const SECTION_702 = 702;
const MIN_TOKEN_LENGTH = 3;

interface DbRule {
  rule_id?: string;
  section?: number;
  text?: string;
  tokens_json?: string;
}

export interface GetContextRNResult {
  bundle: ContextBundle;
  final_context_bundle_canonical: string;
}

function join(packRoot: string, rel: string): string {
  const root = packRoot.replace(/\/+$/, '');
  const path = rel.replace(/^\/+/, '');
  return path ? `${root}/${path}` : root;
}

function overlapScore(
  ruleTokens: string[],
  queryTokens: Set<string>,
  cardTokens: Set<string>,
): [number, number] {
  const ruleSet = new Set(ruleTokens);
  let oq = 0;
  let oc = 0;
  for (const t of ruleSet) {
    if (queryTokens.has(t)) oq++;
    if (cardTokens.has(t)) oc++;
  }
  return [oq, oc];
}

function dedupeRulesById(rules: DbRule[]): DbRule[] {
  const seen = new Set<string>();
  const out: DbRule[] = [];
  for (const r of rules) {
    const rid = (r.rule_id as string) ?? '';
    if (!rid || seen.has(rid)) continue;
    seen.add(rid);
    out.push(r);
  }
  return out;
}

function assemble(
  cards: Array<{ oracle_text?: string }>,
  defRules: DbRule[],
  mechanismRules: DbRule[],
  supportingRules: DbRule[],
  budget: number,
): {
  cards: Array<{ oracle_id: string; name: string; oracle_text: string }>;
  rules: DbRule[];
  tokenEst: number;
} {
  let total = 0;
  const includedCards: Array<{
    oracle_id: string;
    name: string;
    oracle_text: string;
  }> = [];
  const includedRules: DbRule[] = [];
  const cardContexts = cards.map(c => ({
    oracle_id: (c as { oracle_id?: string }).oracle_id ?? '',
    name: (c as { name?: string }).name ?? '',
    oracle_text: (c as { oracle_text?: string }).oracle_text ?? '',
  }));
  for (const card of cardContexts) {
    const est = tokenEst(card.oracle_text);
    if (total + est <= budget) {
      total += est;
      includedCards.push(card);
    } else break;
  }
  for (const r of defRules.slice(0, 2)) {
    const text = r.text ?? '';
    const est = tokenEst(text);
    if (total + est <= budget) {
      total += est;
      includedRules.push(r);
    } else break;
  }
  for (const r of mechanismRules) {
    const text = r.text ?? '';
    const est = tokenEst(text);
    if (total + est <= budget) {
      total += est;
      includedRules.push(r);
    } else break;
  }
  for (const r of supportingRules) {
    const text = r.text ?? '';
    const est = tokenEst(text);
    if (total + est <= budget) {
      total += est;
      includedRules.push(r);
    } else break;
  }
  return { cards: includedCards, rules: includedRules, tokenEst: total };
}

function generalTokens(normalized: string, stopwords: Set<string>): string[] {
  return normalized
    .split(/\s+/)
    .filter(t => t.length >= MIN_TOKEN_LENGTH && !stopwords.has(t));
}

export async function getContextRN(
  queryText: string,
  packRoot: string,
  fileReader: PackFileReader,
): Promise<GetContextRNResult> {
  const manifestRaw = await fileReader.readFile('manifest.json');
  const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
  const caps = (manifest?.sidecars as Record<string, unknown>)?.capabilities as
    | Record<string, unknown>
    | undefined;
  const cp = caps?.context_provider as Record<string, unknown> | undefined;
  if (!cp)
    throw new Error('manifest.sidecars.capabilities.context_provider missing');
  const files = (cp.files ?? {}) as Record<string, { path?: string }>;
  const routerMapPath = files.router_map?.path ?? 'router/router_map.json';

  const routerMapJson = await fileReader.readFile(routerMapPath);
  const routerMap = loadRouterMap(JSON.parse(routerMapJson));

  let spec: ContextProviderSpec | null = null;
  try {
    const specRaw = await fileReader.readFile('context_provider_spec.json');
    spec = JSON.parse(specRaw) as ContextProviderSpec;
  } catch {
    // optional
  }

  const cardsDb = openCardsDb(packRoot);
  const rulesDb = openRulesDb(packRoot);
  try {
    const analysis = analyzeQuery(queryText, routerMap, spec);
    const normalized = analysis.q_norm.trim();
    const stopwordsList = getStopwords(routerMap) || ['the', 'a', 'of'];
    const stopwords = new Set(stopwordsList);
    const thresholds = getResolverThresholds(routerMap);
    const generalTokenSet = new Set(generalTokens(normalized, stopwords));
    const prefixLenMin = thresholds.prefix_len_min ?? 3;

    let resolvedCards: DbRow[] = [];
    if (analysis.what_does_name_norm) {
      const row = cardsDb.cardByNameNorm(analysis.what_does_name_norm);
      if (row) resolvedCards = [row];
    }
    if (resolvedCards.length === 0 && normalized) {
      let row = cardsDb.cardByNameNorm(normalized);
      if (row) {
        resolvedCards = [row];
      } else {
        const tokens = normalized.split(/\s+/).filter(Boolean);
        for (let n = Math.min(4, tokens.length); n >= 2; n--) {
          const phrase = tokens.slice(0, n).join(' ');
          if (phrase.length < prefixLenMin) continue;
          row = cardsDb.cardByNameNorm(phrase);
          if (row && normalized.startsWith(phrase)) {
            resolvedCards = [row];
            break;
          }
        }
        if (resolvedCards.length === 0 && tokens.length >= 2) {
          for (let n = Math.min(4, tokens.length); n >= 2; n--) {
            for (let i = 0; i <= tokens.length - n; i++) {
              const phrase = tokens.slice(i, i + n).join(' ');
              row = cardsDb.cardByNameNorm(phrase);
              if (row) {
                resolvedCards = [row];
                break;
              }
            }
            if (resolvedCards.length > 0) break;
          }
        }
        if (resolvedCards.length === 0) {
          for (let n = Math.min(4, tokens.length); n >= 1; n--) {
            const phrase = tokens.slice(0, n).join(' ');
            if (phrase.length < prefixLenMin) continue;
            row = cardsDb.cardByNameNorm(phrase);
            if (row && normalized.startsWith(phrase)) {
              resolvedCards = [row];
              break;
            }
          }
        }
      }
    }

    const cardKeywords: string[] = [];
    for (const card of resolvedCards) {
      const ot = (card as { oracle_text?: string }).oracle_text ?? '';
      cardKeywords.push(...generalTokens(normalize(ot, spec), stopwords));
    }
    const keywords = [...new Set([...generalTokenSet, ...cardKeywords])];

    const plan = route(analysis, routerMap, cardKeywords, spec);
    const sectionsConsidered = plan.section_intents.map(([s]) => s);
    const sectionsSelected = [...new Set(sectionsConsidered)];

    const keywordAbilitiesMap = getKeywordAbilities(routerMap);
    const definitionsMap = getDefinitions(routerMap);
    const sectionDefaults = getSectionDefaults(routerMap);
    const triggered702 =
      sectionsSelected.some(s => s === '702') ||
      [...generalTokenSet, ...cardKeywords].some(
        t => t in (keywordAbilitiesMap || {}),
      );

    const cardTokenSet = new Set(cardKeywords);
    const rulesResult: DbRule[] = [];
    const conceptDefaultIds = plan.concept_default_rule_ids || [];
    const keywordPrefixes = plan.hard_includes || [];

    for (const prefix of [...new Set(keywordPrefixes)]) {
      const rows = rulesDb.rulesByRuleIdPrefix(prefix);
      rulesResult.push(...(rows as DbRule[]));
    }
    for (const rid of [...new Set(conceptDefaultIds)]) {
      const r = rulesDb.ruleById(rid);
      if (r) rulesResult.push(r as DbRule);
    }

    for (const [secStr] of plan.section_intents) {
      const secInt = parseInt(secStr, 10);
      if (Number.isNaN(secInt) || (secInt === SECTION_702 && !triggered702))
        continue;
      const rows = rulesDb.rulesBySection(secInt);
      const scored: Array<{ score: number; rid: string; r: DbRule }> = [];
      for (const r of rows) {
        let ruleTokens: string[] = [];
        try {
          ruleTokens = JSON.parse(
            (r.tokens_json as string) ?? '[]',
          ) as string[];
        } catch {
          ruleTokens = [];
        }
        const [oq, oc] = overlapScore(
          ruleTokens,
          generalTokenSet,
          cardTokenSet,
        );
        const score = oq + oc;
        if (score < 2) continue;
        if (resolvedCards.length > 0 && oc < 1) continue;
        const rid = (r.rule_id as string) ?? '';
        scored.push({ score, rid, r: r as DbRule });
      }
      scored.sort((a, b) =>
        a.score !== b.score ? b.score - a.score : a.rid < b.rid ? -1 : 1,
      );
      const top = scored.slice(0, 3);
      for (const { r } of top) rulesResult.push(r);
      if (top.length === 0 && sectionDefaults[secStr]) {
        const rid = sectionDefaults[secStr][0];
        const r = rulesDb.ruleById(rid);
        if (r) rulesResult.push(r as DbRule);
      }
    }

    const defRuleIds: string[] = [];
    for (const t of [...generalTokenSet]) {
      if (definitionsMap[t]) defRuleIds.push(...definitionsMap[t].slice(0, 2));
    }
    const defRuleIdsUniq = [...new Set(defRuleIds)].slice(0, 2);
    const defRules: DbRule[] = [];
    for (const rid of defRuleIdsUniq) {
      const r = rulesDb.ruleById(rid);
      if (r) defRules.push(r as DbRule);
    }

    const mechanismSections = new Set(sectionsSelected);
    const mechanismRules = rulesResult.filter(r =>
      mechanismSections.has(String(r.section)),
    );
    const supportingRules = rulesResult.filter(
      r => !mechanismSections.has(String(r.section)),
    );
    const deduped = dedupeRulesById([
      ...defRules,
      ...mechanismRules,
      ...supportingRules,
    ]);
    const defIdsSet = new Set(defRules.map(r => r.rule_id));
    const mechIdsSet = new Set(mechanismRules.map(r => r.rule_id));
    const finalDefRules = deduped
      .filter(r => r.rule_id && defIdsSet.has(r.rule_id))
      .slice(0, 2);
    const finalMechRules = deduped.filter(
      r => r.rule_id && mechIdsSet.has(r.rule_id) && !defIdsSet.has(r.rule_id!),
    );
    const finalSupportRules = deduped.filter(
      r => !defIdsSet.has(r.rule_id!) && !mechIdsSet.has(r.rule_id!),
    );

    const cardContextsForAssemble = resolvedCards.map(c => ({
      oracle_id: (c as { oracle_id?: string }).oracle_id ?? '',
      name: (c as { name?: string }).name ?? '',
      oracle_text: (c as { oracle_text?: string }).oracle_text ?? '',
    }));
    const { cards: inclCards, rules: inclRules } = assemble(
      cardContextsForAssemble,
      finalDefRules,
      finalMechRules,
      finalSupportRules,
      RAG_CONFIG.context_budget,
    );

    const parts: string[] = [];
    for (const card of inclCards) {
      parts.push(`[Card: ${card.name}]\n${card.oracle_text}`);
    }
    for (const r of inclRules) {
      parts.push(`[Rule ${r.rule_id}]\n${r.text ?? ''}`);
    }
    const rawBundle = parts.join('\n\n');
    const canonicalBundle = canonicalizeBundle(rawBundle);

    const routingTrace: RoutingTrace = {
      sections_considered: sectionsConsidered,
      sections_selected: sectionsSelected,
    };

    const bundle: ContextBundle = {
      cards: inclCards,
      rules: inclRules.map(r => ({
        rule_id: (r.rule_id as string) ?? '',
        section: (r.section as number) ?? 0,
        text: (r.text as string) ?? '',
      })),
      keywords,
      routing_trace: routingTrace,
    };

    return {
      bundle,
      final_context_bundle_canonical: canonicalBundle,
    };
  } finally {
    cardsDb.close();
    rulesDb.close();
  }
}
