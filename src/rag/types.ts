/**
 * RAG integration layer types.
 * Aligns with CONTENT_PACK.md and the Ollama RAG + validation plan.
 */

/**
 * In this app version the ask path uses the deterministic context provider only.
 * Embeddings are not present; embedModelId/embedModelPath are unused for the
 * primary path. Packs are expected to have context_provider capability and
 * no vector retrieval in-app. Set to false only if you re-enable the
 * embedding-based retrieval path (e.g. for lab/legacy).
 */
export const RAG_USE_DETERMINISTIC_CONTEXT_ONLY = true;

/** Supported pack_schema_version values. App hard-fails on unknown. */
export const PACK_SCHEMA_VERSION = 1;

/** Supported sidecars validate capability schema_version. */
export const VALIDATE_CAPABILITY_SCHEMA_VERSION = 1;

/** Supported retrieval format (e.g. hnsw layout). */
export const RETRIEVAL_FORMAT_VERSION = 1;

/** Paths and format for the validate capability (files map only). */
export interface ValidateCapabilityFiles {
  rules_rule_ids: { path: string; format: string };
  cards_name_lookup: { path: string; format: string };
}

export interface ValidateCapability {
  schema_version: number;
  files: ValidateCapabilityFiles;
  counts?: { rules?: number; cards?: number };
  key_space?: string;
  compression?: string;
}

export interface SidecarsCapability {
  path?: string;
  format?: string;
  file?: string;
  files?: Record<string, { path: string; format: string }>;
  schema_version?: number;
  index?: string;
  count?: number;
  counts?: Record<string, number>;
  key_space?: string;
  compression?: string;
}

export interface ManifestSidecars {
  schema_version: number;
  capabilities: {
    validate: ValidateCapability;
    [key: string]: SidecarsCapability | ValidateCapability | undefined;
  };
}

export interface ManifestIndices {
  rules?: { chunk_count?: number; path?: string };
  cards?: { chunk_count?: number; path?: string };
}

export interface Manifest {
  pack_schema_version: number;
  retrieval_format_version?: number;
  sidecars: ManifestSidecars;
  indices?: ManifestIndices;
  embed?: { embed_model_id?: string; [key: string]: unknown };
}

/** index_meta.json — authoritative for retrieval (embed_model_id, dim, metric, etc.). */
export interface IndexMeta {
  embed_model_id: string;
  dim: number;
  metric: 'l2' | 'cosine';
  normalize: boolean;
  pooling?: string;
  max_rows?: number;
  doc_count?: number;
  [key: string]: unknown;
}

/** Chunk row as returned from chunks.jsonl (minimal for context building). */
export interface ChunkRow {
  doc_id: string;
  text?: string;
  source?: string;
  title?: string;
  [key: string]: unknown;
}

/** Single retrieval hit (row id + doc_id + source + optional title). */
export interface RetrievalHit {
  rowId: number;
  doc_id: string;
  source_type: 'rules' | 'cards';
  title?: string;
  score?: number;
}

/** Resolved pack state after successful load. */
export interface PackState {
  packRoot: string;
  manifest: Manifest;
  rules: {
    indexMeta: IndexMeta;
    chunksPath: string;
    vectorsPath: string;
    rowMapPath: string;
  };
  cards: {
    indexMeta: IndexMeta;
    chunksPath: string;
    vectorsPath: string;
    rowMapPath: string;
  };
  validate: {
    rulesRuleIdsPath: string;
    cardsNameLookupPath: string;
  };
}

/**
 * Init params; app identifies embed model by id when embeddings are used.
 * When RAG_USE_DETERMINISTIC_CONTEXT_ONLY is true: embedModelId/embedModelPath
 * are ignored; the app uses the deterministic context provider (SQLite + router_map + spec)
 * and does not load or use any embed model.
 */
export interface RagInitParams {
  embedModelId: string;
  embedModelPath: string;
  chatModelPath: string;
  packRoot: string;
  /** When set, use Ollama HTTP API for embed + completion instead of llama.rn (e.g. "http://10.0.2.2:11434" or "http://localhost:11434"). */
  ollamaHost?: string;
  /** Ollama model name for embeddings (must match pack dim, e.g. nomic-embed-text). */
  ollamaEmbedModel?: string;
  /** Ollama model name for chat completion (e.g. llama3.2, mistral). */
  ollamaChatModel?: string;
}

/** Structured error for hard-fail (pack invalid, embed mismatch, etc.). */
export interface RagError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** File reader abstraction: paths relative to pack root. Caller provides implementation (e.g. native module or RNFS). */
export interface PackFileReader {
  readFile(relativePath: string): Promise<string>;
  readFileBinary(relativePath: string): Promise<ArrayBuffer>;
}
