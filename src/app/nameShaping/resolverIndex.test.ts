/**
 * Resolver index: build from name_lookup JSONL, query by base signature, debug sample.
 * Covers: parse (canonical + aliases), skip empty/parse failures (no recovery/coercion),
 * build, getCandidatesBySignature, getAllIndexedCards, getIndexStats, getDebugSample.
 */

import { buildCardNameSignature } from './buildCardNameSignature';
import { buildResolverIndex } from './resolverIndex';

function createReader(jsonl: string) {
  return {
    readFile: async () => jsonl,
  };
}

describe('buildResolverIndex', () => {
  it('parses JSONL into cardId/displayName pairs (canonical + aliases)', async () => {
    const jsonl = [
      JSON.stringify({
        doc_id: 'card-1',
        name: 'Atraxa, Praetors\' Voice',
        norm: 'atraxa praetors voice',
        aliases_norm: ['atraxa'],
      }),
      JSON.stringify({
        doc_id: 'card-2',
        name: 'Urborg',
        norm: 'urborg',
        aliases_norm: [],
      }),
    ].join('\n');
    const reader = createReader(jsonl);
    const index = await buildResolverIndex(reader, 'cards/name_lookup.jsonl');

    const all = index.getAllIndexedCards();
    expect(all.length).toBe(3); // Atraxa full name + alias, Urborg
    const displayNames = all.map((e) => e.displayName).sort();
    expect(displayNames).toContain('Atraxa, Praetors\' Voice');
    expect(displayNames).toContain('atraxa');
    expect(displayNames).toContain('Urborg');

    const atraxaEntries = all.filter((e) => e.cardId === 'card-1');
    expect(atraxaEntries.length).toBe(2);
  });

  it('falls back to aliases when aliases_norm is absent', async () => {
    const jsonl = [
      JSON.stringify({
        doc_id: 'card-1',
        name: 'Hans Eriksson',
        norm: 'hans eriksson',
        aliases: ['Hans-Eriksson'],
      }),
    ].join('\n');
    const reader = createReader(jsonl);
    const index = await buildResolverIndex(reader, 'cards/name_lookup.jsonl');

    const all = index.getAllIndexedCards();
    expect(all.map((e) => e.displayName).sort()).toEqual([
      'Hans Eriksson',
      'Hans-Eriksson',
    ]);
  });

  it('skips empty lines and JSON parse failures; does not throw; no recovery/coercion', async () => {
    const jsonl = [
      '',
      JSON.stringify({ doc_id: 'id-a', name: 'Card A', norm: 'card a' }),
      'not json at all',
      '  \t  ',
      '{"broken":',
      JSON.stringify({ doc_id: 'id-b', norm: 'card b' }),
    ].join('\n');
    const reader = createReader(jsonl);
    const index = await buildResolverIndex(reader, 'any.path');

    const all = index.getAllIndexedCards();
    expect(all.length).toBe(2);
    expect(all.map((e) => e.displayName).sort()).toEqual(['Card A', 'card b']);
  });

  it('builds index and getCandidatesBySignature returns entries by base signature', async () => {
    const atraxaSig = buildCardNameSignature('Atraxa').baseNameSignature;
    const jsonl = [
      JSON.stringify({
        doc_id: 'c1',
        name: 'Atraxa',
        norm: 'atraxa',
        aliases_norm: [],
      }),
      JSON.stringify({
        doc_id: 'c2',
        name: 'Urborg',
        norm: 'urborg',
        aliases_norm: [],
      }),
    ].join('\n');
    const reader = createReader(jsonl);
    const index = await buildResolverIndex(reader, 'cards/name_lookup.jsonl');

    const candidates = index.getCandidatesBySignature(atraxaSig);
    expect(candidates.length).toBe(1);
    expect(candidates[0]!.cardId).toBe('c1');
    expect(candidates[0]!.displayName).toBe('Atraxa');
    expect(candidates[0]!.baseName).toBe('atraxa');
  });

  it('getAllIndexedCards returns all entries including aliases (no deduplication)', async () => {
    const jsonl = [
      JSON.stringify({
        doc_id: 'x',
        name: 'Urza\'s Tower',
        norm: 'urzas tower',
        aliases_norm: ['urza tower'],
      }),
    ].join('\n');
    const reader = createReader(jsonl);
    const index = await buildResolverIndex(reader, 'x.jsonl');

    const all = index.getAllIndexedCards();
    expect(all.length).toBe(2);
    const byDisplay = all.map((e) => e.displayName).sort();
    expect(byDisplay).toEqual(['Urza\'s Tower', 'urza tower']);
    expect(all.every((e) => e.cardId === 'x')).toBe(true);
  });

  it('returns read-only snapshots from the public API', async () => {
    const jsonl = [
      JSON.stringify({
        doc_id: 'c1',
        name: 'Atraxa',
        norm: 'atraxa',
        aliases_norm: ['atraxa praetor'],
      }),
    ].join('\n');
    const reader = createReader(jsonl);
    const index = await buildResolverIndex(reader, 'cards/name_lookup.jsonl');

    const all = index.getAllIndexedCards();
    expect(Object.isFrozen(all)).toBe(false);
    expect(Object.isFrozen(all[0]!)).toBe(true);
    expect(Object.isFrozen(all[0]!.baseNameSignature)).toBe(true);
    expect(Object.isFrozen(all[0]!.fullNameSignature)).toBe(true);

    const candidates = index.getCandidatesBySignature(
      buildCardNameSignature('Atraxa').baseNameSignature
    );
    expect(Object.isFrozen(candidates)).toBe(false);
    expect(candidates).not.toBe(all);

    const originalDisplayName = all[0]!.displayName;
    (all[0] as ResolverIndexEntry).displayName = 'Injected';
    expect(all[0]!.displayName).toBe(originalDisplayName);

    expect(() => {
      (all[0]!.baseNameSignature as string[]).push('BREAK');
    }).toThrow();
  });

  it('getIndexStats returns entryCount and uniqueBaseSignatures', async () => {
    const jsonl = [
      JSON.stringify({ doc_id: 'a', name: 'Alpha', norm: 'alpha', aliases_norm: [] }),
      JSON.stringify({ doc_id: 'b', name: 'Beta', norm: 'beta', aliases_norm: [] }),
    ].join('\n');
    const reader = createReader(jsonl);
    const index = await buildResolverIndex(reader, 'x.jsonl');

    const stats = index.getIndexStats();
    expect(stats.entryCount).toBe(2);
    expect(stats.uniqueBaseSignatures).toBe(2);
  });

  it('getDebugSample returns shape with displayName, normalizedName, baseName, baseNameSignature and respects limit', async () => {
    const lines = Array.from({ length: 30 }, (_, i) =>
      JSON.stringify({
        doc_id: `id-${i}`,
        name: `Card ${i}`,
        norm: `card ${i}`,
        aliases_norm: [],
      })
    );
    const reader = createReader(lines.join('\n'));
    const index = await buildResolverIndex(reader, 'x.jsonl');

    const sample = index.getDebugSample(5);
    expect(sample.length).toBe(5);
    for (const item of sample) {
      expect(item).toHaveProperty('displayName');
      expect(item).toHaveProperty('normalizedName');
      expect(item).toHaveProperty('baseName');
      expect(item).toHaveProperty('baseNameSignature');
      expect(Array.isArray(item.baseNameSignature)).toBe(true);
      expect(typeof item.cardId).toBe('string');
    }

    const defaultSample = index.getDebugSample();
    expect(defaultSample.length).toBe(20);
  });
});
