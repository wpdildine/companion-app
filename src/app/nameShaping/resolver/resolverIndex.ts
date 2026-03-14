/**
 * Proper-noun resolver index: in-memory index of card names from the content pack
 * name_lookup dataset. Built once from JSONL; read-only query surface.
 * No SQLite; reader is minimal { readFile }. Signature keying uses the canonical
 * signatureToKey function only (single blessed path).
 */

import { buildCardNameSignature } from '../foundation/buildCardNameSignature';
import type { NameShapingSelector } from '../foundation/nameShapingConstants';
import type {
  NormalizedNameShapingSignature,
  ResolverIndex,
  ResolverIndexEntry,
} from '../foundation/nameShapingTypes';

/** Minimal reader: paths relative to pack root. Caller provides e.g. getFileReader() from RAG. */
export interface ResolverIndexReader {
  readFile(relativePath: string): Promise<string>;
}

/** One row emitted from parsing: cardId + displayName (canonical or alias). */
interface CardNameRow {
  cardId: string;
  displayName: string;
}

/**
 * Canonical internal key function for signature → map key.
 * Single blessed path for signature keying; do not introduce ad hoc keying elsewhere.
 */
function signatureToKey(sig: NormalizedNameShapingSignature): string {
  return JSON.stringify(sig);
}

function freezeSignature(
  signature: NormalizedNameShapingSignature
): NormalizedNameShapingSignature {
  return Object.freeze([...signature]);
}

function freezeEntry(entry: ResolverIndexEntry): ResolverIndexEntry {
  return Object.freeze({
    ...entry,
    fullNameSignature: freezeSignature(entry.fullNameSignature),
    baseNameSignature: freezeSignature(entry.baseNameSignature),
  });
}

/**
 * Parse name_lookup.jsonl into cardId/displayName rows.
 * Skip empty lines and JSON parse failures; do not attempt recovery/coercion.
 */
function parseNameLookupJsonl(raw: string): CardNameRow[] {
  const rows: CardNameRow[] = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(line) as {
        doc_id?: string;
        name?: string;
        norm?: string;
        aliases?: string[];
        aliases_norm?: string[];
      };
      const cardId = parsed.doc_id ?? '';
      const canonical = (parsed.name ?? parsed.norm ?? '').trim();
      if (cardId && canonical) {
        rows.push({ cardId, displayName: canonical });
      }
      const aliases = parsed.aliases_norm ?? parsed.aliases ?? [];
      for (const a of aliases) {
        const alias = typeof a === 'string' ? a.trim() : '';
        if (alias && cardId) {
          rows.push({ cardId, displayName: alias });
        }
      }
    } catch {
      // Skip JSON parse failures; do not attempt recovery/coercion.
    }
  }
  return rows;
}

/**
 * Build the resolver index from the pack's card-name dataset.
 * Call with reader + path (e.g. getFileReader(), packState.validate.cardsNameLookupPath).
 */
export async function buildResolverIndex(
  reader: ResolverIndexReader,
  nameLookupPath: string
): Promise<ResolverIndex> {
  const raw = await reader.readFile(nameLookupPath);
  const nameRows = parseNameLookupJsonl(raw);

  const allEntries: ResolverIndexEntry[] = [];
  const byBaseKey = new Map<string, ResolverIndexEntry[]>();
  const byFullKey = new Map<string, ResolverIndexEntry[]>();
  const bySelector = new Map<NameShapingSelector, ResolverIndexEntry[]>();

  for (const { cardId, displayName } of nameRows) {
    const sigResult = buildCardNameSignature(displayName);
    const entry = freezeEntry({
      cardId,
      displayName,
      normalizedName: sigResult.normalizedName,
      baseName: sigResult.baseName,
      fullNameSignature: sigResult.fullNameSignature,
      baseNameSignature: sigResult.baseNameSignature,
    });
    allEntries.push(entry);

    const baseKey = signatureToKey(sigResult.baseNameSignature);
    let baseList = byBaseKey.get(baseKey);
    if (!baseList) {
      baseList = [];
      byBaseKey.set(baseKey, baseList);
    }
    baseList.push(entry);

    const fullKey = signatureToKey(sigResult.fullNameSignature);
    let fullList = byFullKey.get(fullKey);
    if (!fullList) {
      fullList = [];
      byFullKey.set(fullKey, fullList);
    }
    fullList.push(entry);

    for (const selector of new Set(sigResult.baseNameSignature)) {
      let selectorList = bySelector.get(selector);
      if (!selectorList) {
        selectorList = [];
        bySelector.set(selector, selectorList);
      }
      selectorList.push(entry);
    }
  }

  const readonlyAllEntries = Object.freeze([...allEntries]);
  const readonlyByBaseKey = new Map<string, readonly ResolverIndexEntry[]>();
  for (const [key, entries] of byBaseKey.entries()) {
    readonlyByBaseKey.set(key, Object.freeze([...entries]));
  }
  const readonlyBySelector = new Map<NameShapingSelector, readonly ResolverIndexEntry[]>();
  for (const [selector, entries] of bySelector.entries()) {
    readonlyBySelector.set(selector, Object.freeze([...entries]));
  }

  const index: ResolverIndex = {
    getCandidatesBySignature(signature: NormalizedNameShapingSignature): readonly ResolverIndexEntry[] {
      const key = signatureToKey(signature);
      const entries = readonlyByBaseKey.get(key);
      return entries ? [...entries] : [];
    },

    getAllIndexedCards(): readonly ResolverIndexEntry[] {
      return readonlyAllEntries;
    },

    getEntriesSharingSelectors(
      signature: NormalizedNameShapingSignature,
    ): readonly ResolverIndexEntry[] {
      const deduped = new Set<ResolverIndexEntry>();
      for (const selector of new Set(signature)) {
        const entries = readonlyBySelector.get(selector);
        if (!entries) continue;
        for (const entry of entries) {
          deduped.add(entry);
        }
      }
      return [...deduped];
    },

    getIndexStats(): { entryCount: number; uniqueBaseSignatures: number } {
      return {
        entryCount: readonlyAllEntries.length,
        uniqueBaseSignatures: readonlyByBaseKey.size,
      };
    },

    getDebugSample(limit = 20): ReadonlyArray<{
      displayName: string;
      normalizedName: string;
      baseName: string;
      baseNameSignature: NormalizedNameShapingSignature;
      cardId?: string;
    }> {
      const slice = readonlyAllEntries.slice(0, limit);
      return slice.map((e) => ({
        displayName: e.displayName,
        normalizedName: e.normalizedName,
        baseName: e.baseName,
        baseNameSignature: e.baseNameSignature,
        cardId: e.cardId,
      }));
    },
  };

  return index;
}
