/**
 * Pack loader: manifest, validate capability, index_meta.
 * Hard-fails if validate capability missing/unsupported or embed_model_id mismatch.
 */

import type { PackFileReader } from './types';
import {
  PACK_SCHEMA_VERSION,
  VALIDATE_CAPABILITY_SCHEMA_VERSION,
  RETRIEVAL_FORMAT_VERSION,
  type Manifest,
  type IndexMeta,
  type PackState,
  type RagInitParams,
} from './types';
import { ragError, type RagErrorCode } from './errors';

function parseJson<T>(raw: string, path: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw ragError('E_PACK_LOAD', `Invalid JSON: ${path}`, {
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Load manifest from pack root. Throws on missing/unsupported version or missing validate capability.
 */
export async function loadManifest(
  reader: PackFileReader,
  _packRoot: string
): Promise<Manifest> {
  const raw = await reader.readFile('manifest.json');
  const manifest = parseJson<Manifest>(raw, 'manifest.json');

  if (manifest.pack_schema_version !== PACK_SCHEMA_VERSION) {
    throw ragError('E_PACK_SCHEMA', `Unsupported pack_schema_version: ${manifest.pack_schema_version}`, {
      expected: PACK_SCHEMA_VERSION,
    });
  }

  const rfv = manifest.retrieval_format_version ?? 1;
  if (rfv !== RETRIEVAL_FORMAT_VERSION) {
    throw ragError('E_RETRIEVAL_FORMAT', `Unsupported retrieval_format_version: ${rfv}`, {
      expected: RETRIEVAL_FORMAT_VERSION,
    });
  }

  const validate = manifest.sidecars?.capabilities?.validate;
  if (!validate) {
    throw ragError('E_VALIDATE_CAPABILITY', 'Validate capability is required; missing from manifest.');
  }

  if (validate.schema_version !== VALIDATE_CAPABILITY_SCHEMA_VERSION) {
    throw ragError('E_VALIDATE_SCHEMA', `Unsupported validate capability schema_version: ${validate.schema_version}`, {
      expected: VALIDATE_CAPABILITY_SCHEMA_VERSION,
    });
  }

  const files = validate.files;
  if (!files?.rules_rule_ids?.path || !files?.cards_name_lookup?.path) {
    throw ragError('E_VALIDATE_CAPABILITY', 'Validate capability must have files.rules_rule_ids.path and files.cards_name_lookup.path');
  }

  return manifest;
}

/**
 * Load index_meta.json for an index (rules or cards). Validates embed contract fields.
 */
export async function loadIndexMeta(
  reader: PackFileReader,
  indexDir: string
): Promise<IndexMeta> {
  const raw = await reader.readFile(`${indexDir}/index_meta.json`);
  const meta = parseJson<IndexMeta>(raw, `${indexDir}/index_meta.json`);

  if (!meta.embed_model_id || typeof meta.dim !== 'number') {
    throw ragError('E_INDEX_META', `Missing embed_model_id or dim in ${indexDir}/index_meta.json`);
  }
  const metric = meta.metric ?? 'l2';
  if (metric !== 'l2' && metric !== 'cosine') {
    throw ragError('E_INDEX_META', `Unsupported metric: ${metric}`);
  }
  return meta;
}

/**
 * Read the pack's embed_model_id from rules/index_meta.json (no full load).
 * Use this so the app can init with the pack's id and avoid E_EMBED_MISMATCH.
 */
export async function getPackEmbedModelId(reader: PackFileReader): Promise<string> {
  const meta = await loadIndexMeta(reader, 'rules');
  if (!meta.embed_model_id) {
    throw ragError('E_INDEX_META', 'rules/index_meta.json has no embed_model_id');
  }
  return meta.embed_model_id;
}

/**
 * Full pack load: manifest, validate paths, index_meta for rules and cards.
 * Enforces pack embed_model_id === app embedModelId (hard-fail on mismatch).
 */
export async function loadPack(
  reader: PackFileReader,
  params: RagInitParams
): Promise<PackState> {
  const { packRoot, embedModelId } = params;
  const manifest = await loadManifest(reader, packRoot);

  const validate = manifest.sidecars!.capabilities!.validate!;
  const rulesRuleIdsPath = validate.files.rules_rule_ids.path;
  const cardsNameLookupPath = validate.files.cards_name_lookup.path;

  const rulesMeta = await loadIndexMeta(reader, 'rules');
  const cardsMeta = await loadIndexMeta(reader, 'cards');

  if (rulesMeta.embed_model_id !== embedModelId) {
    throw ragError('E_EMBED_MISMATCH', `Pack embed_model_id does not match app config`, {
      pack: rulesMeta.embed_model_id,
      app: embedModelId,
    });
  }
  if (cardsMeta.embed_model_id !== embedModelId) {
    throw ragError('E_EMBED_MISMATCH', `Pack (cards) embed_model_id does not match app config`, {
      pack: cardsMeta.embed_model_id,
      app: embedModelId,
    });
  }

  if (validate.counts?.rules != null && manifest.indices?.rules?.chunk_count != null) {
    if (validate.counts.rules !== manifest.indices.rules.chunk_count) {
      throw ragError('E_COUNTS_MISMATCH', 'Validate counts.rules does not match manifest.indices.rules.chunk_count', {
        counts_rules: validate.counts.rules,
        indices_rules_chunk_count: manifest.indices.rules.chunk_count,
      });
    }
  }

  return {
    packRoot,
    manifest,
    rules: {
      indexMeta: rulesMeta,
      chunksPath: 'rules/chunks.jsonl',
      vectorsPath: 'rules/vectors.f16',
      rowMapPath: 'rules/row_map.jsonl',
    },
    cards: {
      indexMeta: cardsMeta,
      chunksPath: 'cards/chunks.jsonl',
      vectorsPath: 'cards/vectors.f16',
      rowMapPath: 'cards/row_map.jsonl',
    },
    validate: {
      rulesRuleIdsPath,
      cardsNameLookupPath,
    },
  };
}
