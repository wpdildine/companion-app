/**
 * Retrieval: decode vectors.f16 once, brute-force L2 top-k, merge rules + cards.
 * Optimization (plan step 6): JSI/native brute-force for the L2 loop, then optional
 * native HNSW loader (respect retrieval_format_version) for large packs.
 */

import type { PackFileReader } from './types';
import type { IndexMeta } from './types';
import type { RetrievalHit } from './types';
import { ragError } from './errors';

/** Decode little-endian float16 buffer to Float32Array. */
function decodeF16(buffer: ArrayBuffer): Float32Array {
  const u16 = new Uint16Array(buffer);
  const n = u16.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = u16[i]!;
    const sign = (x >> 15) & 1;
    const exp = (x >> 10) & 0x1f;
    const frac = x & 0x3ff;
    if (exp === 0) {
      out[i] = frac === 0 ? 0 : (sign ? -1 : 1) * Math.pow(2, -14) * (frac / 1024);
    } else if (exp === 0x1f) {
      out[i] = frac ? NaN : (sign ? -Infinity : Infinity);
    } else {
      out[i] = (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
    }
  }
  return out;
}

export interface VectorIndex {
  meta: IndexMeta;
  vectors: Float32Array;
  dim: number;
  nRows: number;
}

const vectorCache = new Map<string, VectorIndex>();

function cacheKey(indexKey: string, path: string): string {
  return `${indexKey}:${path}`;
}

/**
 * Load and decode vectors.f16 once; cache by (indexKey, path).
 */
export async function loadVectors(
  reader: PackFileReader,
  vectorsPath: string,
  meta: IndexMeta,
  indexKey: string
): Promise<VectorIndex> {
  const key = cacheKey(indexKey, vectorsPath);
  const cached = vectorCache.get(key);
  if (cached) return cached;

  const buf = await reader.readFileBinary(vectorsPath);
  const dim = meta.dim;
  const nRows = Math.floor(buf.byteLength / (dim * 2));
  if (meta.max_rows != null && nRows > meta.max_rows) {
    throw ragError('E_RETRIEVAL', `Index exceeds max_rows: ${nRows} > ${meta.max_rows}`);
  }
  const vectors = decodeF16(buf);
  const index: VectorIndex = { meta, vectors, dim, nRows };
  vectorCache.set(key, index);
  return index;
}

/** L2 distance between a and b (same length). */
function l2(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Brute-force L2 top-k over rows. queryVector length must equal index.dim.
 */
export function searchL2(
  index: VectorIndex,
  queryVector: Float32Array,
  k: number
): Array<{ rowId: number; score: number }> {
  if (queryVector.length !== index.dim) {
    throw ragError('E_RETRIEVAL', `Query dim ${queryVector.length} !== index dim ${index.dim}`);
  }
  const { vectors, dim, nRows } = index;
  const heap: Array<{ rowId: number; score: number }> = [];
  const push = (rowId: number, score: number) => {
    heap.push({ rowId, score });
    heap.sort((a, b) => a.score - b.score);
    if (heap.length > k) heap.pop();
  };
  for (let row = 0; row < nRows; row++) {
    const offset = row * dim;
    const dist = l2(queryVector, vectors.subarray(offset, offset + dim));
    if (heap.length < k || dist < heap[heap.length - 1]!.score) {
      push(row, dist);
    }
  }
  return heap;
}

/**
 * Load row_map.jsonl to get doc_id by row id. Returns array where index is rowId.
 */
export async function loadRowMap(
  reader: PackFileReader,
  rowMapPath: string
): Promise<string[]> {
  const raw = await reader.readFile(rowMapPath);
  const lines = raw.split('\n').filter((l) => l.trim());
  const docIds: string[] = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as { doc_id?: string };
      docIds.push(row.doc_id ?? '');
    } catch {
      docIds.push('');
    }
  }
  return docIds;
}

/**
 * Load chunks by row ids; return map rowId -> chunk (doc_id, text, etc.).
 */
export async function loadChunksForRows(
  reader: PackFileReader,
  chunksPath: string,
  rowIds: number[]
): Promise<Map<number, { doc_id: string; text?: string; title?: string }>> {
  const raw = await reader.readFile(chunksPath);
  const lines = raw.split('\n').filter((l) => l.trim());
  const byRowId = new Map<number, { doc_id: string; text?: string; title?: string }>();
  const set = new Set(rowIds);
  let rowIndex = 0;
  for (const line of lines) {
    if (!set.has(rowIndex)) {
      rowIndex++;
      continue;
    }
    try {
      const row = JSON.parse(line) as { doc_id?: string; text?: string; title?: string };
      byRowId.set(rowIndex, {
        doc_id: row.doc_id ?? '',
        text: row.text,
        title: row.title,
      });
    } catch {
      // skip
    }
    rowIndex++;
  }
  return byRowId;
}
