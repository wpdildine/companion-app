/**
 * Cycle 7: getContext (Node / pack_runtime) vs getContextRN (RN pipeline + mocked native SQLite).
 * Compares `semanticFrontDoor` for the same pack and queries when `content_pack` and runtime-ts
 * build exist. Skips otherwise (CI without pack, or before `npm run build` in runtime-ts).
 *
 * Uses default Jest + RN preset so `@atlas/runtime` resolves like the app; sibling
 * `better-sqlite3` is excluded from Babel transform (see jest.config.js).
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type { SemanticFrontDoor } from '@atlas/runtime';

const PACK_ROOT = path.resolve(__dirname, '../../pack_runtime/content_pack');
/** Jest mock factory may run before beforeEach sets env — allowed `mock*` escape hatch. */
const mockAtlasFrontDoorPackRoot = PACK_ROOT;
const RUNTIME_TS = path.resolve(__dirname, '../../pack_runtime/runtime-ts');
const CONTEXT_CLI = path.join(RUNTIME_TS, 'dist/contextCli.js');
const QUERY_MATRIX: { query: string; label: string }[] = [
  { query: 'Partner with Kraum', label: 'abstain_no_grounding_cardish' },
  { query: 'layers and timestamps', label: 'proceed_rules_query' },
];

function packAndBuildAvailable(): boolean {
  if (!fs.existsSync(path.join(PACK_ROOT, 'manifest.json'))) return false;
  if (!fs.existsSync(CONTEXT_CLI)) return false;
  try {
    require.resolve(
      path.join(RUNTIME_TS, 'node_modules/better-sqlite3'),
    );
    return true;
  } catch {
    return false;
  }
}

function desktopSemanticFrontDoor(query: string): SemanticFrontDoor {
  const out = execFileSync(
    process.execPath,
    [
      CONTEXT_CLI,
      '--query',
      query,
      '--pack',
      PACK_ROOT,
      '--include-trace',
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out) as {
    semantic_front_door?: SemanticFrontDoor;
  };
  const fd = parsed.semantic_front_door;
  if (!fd) {
    throw new Error('contextCli output missing semantic_front_door');
  }
  return fd;
}

/** Order-stable projection for equality (avoids key-order noise). */
function projectFrontDoor(fd: SemanticFrontDoor): Record<string, unknown> {
  return {
    contract_version: fd.contract_version,
    working_query: fd.working_query,
    resolver_mode: fd.resolver_mode,
    transcript_decision: fd.transcript_decision,
    front_door_verdict: fd.front_door_verdict,
    resolver_query_norm: fd.resolver_query_norm ?? undefined,
    ambiguous_candidates: fd.ambiguous_candidates ?? undefined,
    routing_readiness: fd.routing_readiness,
  };
}

const mockSqliteConnections = new Map<
  string,
  import('better-sqlite3').Database
>();

jest.mock('react-native-quick-sqlite', () => {
  const pathMod = require('path') as typeof import('path');
  const { createRequire } = require('module') as typeof import('module');
  const runtimePkg = pathMod.join(
    __dirname,
    '../../pack_runtime/runtime-ts/package.json',
  );
  const requireRuntime = createRequire(runtimePkg);
  const mod = requireRuntime('better-sqlite3') as {
    default?: typeof import('better-sqlite3').default;
  };
  const Database = (mod.default ?? mod) as typeof import('better-sqlite3').default;
  return {
    QuickSQLite: {
      open(name: string, _location: string) {
        const packRoot =
          process.env.ATLAS_FRONT_DOOR_PACK_ROOT || mockAtlasFrontDoorPackRoot;
        const sub = name === 'cards.db' ? 'cards' : 'rules';
        const fp = pathMod.join(packRoot, sub, name);
        mockSqliteConnections.set(
          name,
          new Database(fp, { readonly: true }),
        );
      },
      execute(name: string, sql: string, params: unknown[]) {
        const db = mockSqliteConnections.get(name);
        if (!db) throw new Error(`quick-sqlite mock: db not open: ${name}`);
        const stmt = db.prepare(sql);
        const rows = stmt.all(...(params ?? []));
        return { rows: { _array: rows } };
      },
      close(name: string) {
        const db = mockSqliteConnections.get(name);
        if (db) {
          db.close();
          mockSqliteConnections.delete(name);
        }
      },
    },
  };
});

function makePackReader(root: string) {
  return {
    readFile: async (rel: string) =>
      fs.promises.readFile(path.join(root, rel), 'utf8'),
    readFileBinary: async (_rel: string) => new ArrayBuffer(0),
  };
}

describe('Cycle 7 semantic front door: getContext vs getContextRN', () => {
  const shouldRun = packAndBuildAvailable();
  let getContextRN: typeof import('../src/rag/getContextRN').getContextRN;

  beforeAll(() => {
    if (shouldRun) {
      getContextRN =
        require('../src/rag/getContextRN').getContextRN as typeof import('../src/rag/getContextRN').getContextRN;
    }
  });

  beforeEach(() => {
    for (const db of mockSqliteConnections.values()) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
    mockSqliteConnections.clear();
    process.env.ATLAS_FRONT_DOOR_PACK_ROOT = PACK_ROOT;
  });

  afterEach(() => {
    delete process.env.ATLAS_FRONT_DOOR_PACK_ROOT;
  });

  it.each(QUERY_MATRIX)(
    'semanticFrontDoor matches desktop for $label',
    async ({ query }) => {
      if (!shouldRun || !getContextRN) {
        return;
      }
      const desktop = desktopSemanticFrontDoor(query);
      const rn = await getContextRN(query, PACK_ROOT, makePackReader(PACK_ROOT));
      expect(projectFrontDoor(rn.semanticFrontDoor)).toEqual(
        projectFrontDoor(desktop),
      );
    },
  );
});
