/**
 * Open pack SQLite DBs (cards.db, rules.db) on React Native using react-native-quick-sqlite.
 * Exposes the same query surface as mtg_rules/runtime-ts db.ts for use by getContextRN.
 *
 * react-native-quick-sqlite open(dbName, location): native layer uses (filesDir + "/" + location + "/" + dbName).
 * So location MUST be relative to the app files dir (e.g. "content_pack/cards"), not an absolute path.
 *
 * Requires native module to be linked: iOS run `cd ios && pod install && cd ..`, then rebuild. Android: clean & rebuild.
 */

let _QuickSQLite: typeof import('react-native-quick-sqlite').QuickSQLite | null = null;

function getQuickSQLite(): typeof import('react-native-quick-sqlite').QuickSQLite {
  if (_QuickSQLite != null) return _QuickSQLite;
  try {
    const mod = require('react-native-quick-sqlite');
    const Q = mod?.QuickSQLite ?? mod?.default?.QuickSQLite;
    if (Q) {
      _QuickSQLite = Q;
      return Q;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/quick-sqlite|QuickSQLite/i.test(msg)) {
      throw new Error(
        'RAG needs the native SQLite module. Rebuild the app: iOS: run `cd ios && pod install && cd ..` then build. Android: clean and rebuild. If using Expo, use a development build that includes native modules.'
      );
    }
    throw e;
  }
  throw new Error(
    'RAG needs the native SQLite module. Rebuild the app: iOS: run `cd ios && pod install && cd ..` then build. Android: clean and rebuild.'
  );
}

export type DbRow = Record<string, unknown>;

export interface CardsDb {
  cardByNameNorm(nameNorm: string): DbRow | null;
  cardByOracleId(oracleId: string): DbRow | null;
  cardsByPrefix(prefix: string, candidateCap: number): DbRow[];
  prefixCandidateOracleIds(prefix: string, candidateCap: number): string[];
  close(): void;
}

export interface RulesDb {
  rulesBySection(section: number): DbRow[];
  ruleById(ruleId: string): DbRow | null;
  ruleFromSectionContaining(section: number, substring: string): DbRow | null;
  rulesByRuleIdPrefix(prefix: string): DbRow[];
  close(): void;
}

function rowFromResult(result: { rows?: { _array?: unknown[] } }): DbRow | null {
  const arr = result?.rows?._array;
  if (Array.isArray(arr) && arr.length > 0) return arr[0] as DbRow;
  return null;
}

function rowsFromResult(result: { rows?: { _array?: unknown[] } }): DbRow[] {
  const arr = result?.rows?._array;
  return Array.isArray(arr) ? (arr as DbRow[]) : [];
}

/** Relative location from app files dir, e.g. "content_pack/cards". packRoot is e.g. .../files/content_pack. */
function relativeLocationForDb(packRoot: string, subdir: 'cards' | 'rules'): string {
  const packName = packRoot.slice(packRoot.lastIndexOf('/') + 1) || 'content_pack';
  return `${packName}/${subdir}`;
}

export function openCardsDb(packRoot: string): CardsDb {
  const QuickSQLite = getQuickSQLite();
  const location = relativeLocationForDb(packRoot, 'cards');
  const name = 'cards.db';
  QuickSQLite.open(name, location);
  return {
    cardByNameNorm(nameNorm: string): DbRow | null {
      const r = QuickSQLite.execute(name, 'SELECT * FROM cards WHERE name_norm = ?', [nameNorm]);
      return rowFromResult(r);
    },
    cardByOracleId(oracleId: string): DbRow | null {
      const r = QuickSQLite.execute(name, 'SELECT * FROM cards WHERE oracle_id = ?', [oracleId]);
      return rowFromResult(r);
    },
    cardsByPrefix(prefix: string, candidateCap: number): DbRow[] {
      if (!prefix) return [];
      const r = QuickSQLite.execute(
        name,
        `SELECT DISTINCT c.* FROM cards c INNER JOIN card_name_prefix p ON p.oracle_id = c.oracle_id AND p.prefix = ? ORDER BY c.oracle_id ASC LIMIT ?`,
        [prefix, candidateCap]
      );
      return rowsFromResult(r);
    },
    prefixCandidateOracleIds(prefix: string, candidateCap: number): string[] {
      if (!prefix) return [];
      const r = QuickSQLite.execute(
        name,
        'SELECT oracle_id FROM card_name_prefix WHERE prefix = ? ORDER BY oracle_id ASC LIMIT ?',
        [prefix, candidateCap]
      );
      const rows = rowsFromResult(r);
      return rows.map((row) => String((row as { oracle_id?: string }).oracle_id ?? ''));
    },
    close() {
      try {
        QuickSQLite.close(name);
      } catch {
        // ignore
      }
    },
  };
}

export function openRulesDb(packRoot: string): RulesDb {
  const QuickSQLite = getQuickSQLite();
  const location = relativeLocationForDb(packRoot, 'rules');
  const name = 'rules.db';
  QuickSQLite.open(name, location);
  return {
    rulesBySection(section: number): DbRow[] {
      const r = QuickSQLite.execute(name, 'SELECT * FROM rules WHERE section = ? ORDER BY rule_id ASC', [section]);
      return rowsFromResult(r);
    },
    ruleById(ruleId: string): DbRow | null {
      const r = QuickSQLite.execute(name, 'SELECT * FROM rules WHERE rule_id = ?', [ruleId]);
      return rowFromResult(r);
    },
    ruleFromSectionContaining(section: number, substring: string): DbRow | null {
      const sub = (substring || '').trim().toLowerCase();
      if (!sub) return null;
      const r = QuickSQLite.execute(
        name,
        'SELECT * FROM rules WHERE section = ? AND LOWER(text) LIKE ? ORDER BY rule_id ASC LIMIT 1',
        [section, `%${sub}%`]
      );
      return rowFromResult(r);
    },
    rulesByRuleIdPrefix(prefix: string): DbRow[] {
      const r = QuickSQLite.execute(
        name,
        'SELECT * FROM rules WHERE rule_id LIKE ? ORDER BY rule_id ASC LIMIT 2',
        [prefix + '%']
      );
      return rowsFromResult(r);
    },
    close() {
      try {
        QuickSQLite.close(name);
      } catch {
        // ignore
      }
    },
  };
}
