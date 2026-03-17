/**
 * resolveProperNounBySignature: candidate lookup, deterministic scoring, top-K ranking.
 * Uses a small controlled resolver index fixture; no app runtime or pack wiring.
 */

import { buildCardNameSignature } from '../foundation/buildCardNameSignature';
import { buildResolverIndex } from '../resolver/resolverIndex';
import {
  resolveProperNounBySignature,
  scoreSignatureMatch,
} from '../resolver/resolveProperNounBySignature';

function createReader(jsonl: string) {
  return {
    readFile: async () => jsonl,
  };
}

/** Small fixture: Atraxa, Urborg, Gitrog, Sheoldred, Ayesha. Signatures from buildCardNameSignature tests. */
const FIXTURE_JSONL = [
  JSON.stringify({
    doc_id: 'c-atraxa',
    name: 'Atraxa',
    norm: 'atraxa',
    aliases_norm: [],
  }),
  JSON.stringify({
    doc_id: 'c-urborg',
    name: 'Urborg',
    norm: 'urborg',
    aliases_norm: [],
  }),
  JSON.stringify({
    doc_id: 'c-gitrog',
    name: 'Gitrog',
    norm: 'gitrog',
    aliases_norm: [],
  }),
  JSON.stringify({
    doc_id: 'c-sheoldred',
    name: 'Sheoldred',
    norm: 'sheoldred',
    aliases_norm: [],
  }),
  JSON.stringify({
    doc_id: 'c-ayesha',
    name: 'Ayesha',
    norm: 'ayesha',
    aliases_norm: [],
  }),
].join('\n');

async function buildFixtureIndex() {
  const reader = createReader(FIXTURE_JSONL);
  return buildResolverIndex(reader, 'cards/name_lookup.jsonl');
}

describe('resolveProperNounBySignature', () => {
  it('exact match: input = Atraxa base signature returns Atraxa first with score 100 and matchReason exact', async () => {
    const index = await buildFixtureIndex();
    const atraxaSig = buildCardNameSignature('Atraxa').baseNameSignature;

    const results = resolveProperNounBySignature(index, atraxaSig);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.displayName).toBe('Atraxa');
    expect(results[0]!.score).toBe(100);
    expect(results[0]!.matchReason).toBe('exact');
    expect(results[0]!.cardId).toBe('c-atraxa');
    expect(results[0]!.signature).toEqual(atraxaSig);
  });

  it('prefix match: input = first 3 selectors of Atraxa returns Atraxa with matchReason prefix', async () => {
    const index = await buildFixtureIndex();
    const atraxaFull = buildCardNameSignature('Atraxa').baseNameSignature;
    const prefix = atraxaFull.slice(0, 3);

    const results = resolveProperNounBySignature(index, prefix);

    const atraxaCandidate = results.find((r) => r.displayName === 'Atraxa');
    expect(atraxaCandidate).toBeDefined();
    expect(atraxaCandidate!.matchReason).toBe('prefix');
    expect(atraxaCandidate!.score).toBe(90 - (atraxaFull.length - prefix.length));
  });

  it('ordered overlap: input subset in order yields overlap matchReason and ranks above non-matching', async () => {
    const index = await buildFixtureIndex();
    // Gitrog = HARD, BRIGHT, HARD, LIQUID, ROUND, HARD. Use non-prefix in-order subset: BRIGHT, LIQUID, ROUND.
    const overlapInput = ['BRIGHT', 'LIQUID', 'ROUND'] as const;

    const results = resolveProperNounBySignature(index, overlapInput);

    const gitrog = results.find((r) => r.displayName === 'Gitrog');
    expect(gitrog).toBeDefined();
    expect(gitrog!.matchReason).toBe('overlap');
    const urborg = results.find((r) => r.displayName === 'Urborg');
    if (urborg) {
      expect(gitrog!.score).toBeGreaterThan(urborg.score);
    }
  });

  it('length penalty: longer length delta yields lower overlap score', async () => {
    const index = await buildFixtureIndex();
    // Short input that matches prefix of Atraxa (prefix case) vs same-length input that only overlaps with longer name.
    const shortPrefix = ['BRIGHT', 'HARD'] as const;
    const resultsShort = resolveProperNounBySignature(index, shortPrefix);
    const atraxaFromShort = resultsShort.find((r) => r.displayName === 'Atraxa');
    expect(atraxaFromShort!.score).toBe(90 - (6 - 2)); // 90 - 4 = 86

    const longNoExact = ['BRIGHT', 'HARD', 'LIQUID', 'BRIGHT', 'SOFT', 'BRIGHT', 'ROUND'] as const;
    const resultsLong = resolveProperNounBySignature(index, longNoExact);
    const withOverlap = resultsLong.filter((r) => r.score > 0);
    expect(withOverlap.length).toBeGreaterThan(0);
    const atraxaFromLong = resultsLong.find((r) => r.displayName === 'Atraxa');
    if (atraxaFromLong) {
      expect(atraxaFromLong.score).toBeLessThan(100);
    }
  });

  it('near miss: intended candidate ranks above unrelated near-miss', async () => {
    const index = await buildFixtureIndex();
    const urborgSig = buildCardNameSignature('Urborg').baseNameSignature;
    const results = resolveProperNounBySignature(index, urborgSig);

    expect(results[0]!.displayName).toBe('Urborg');
    expect(results[0]!.score).toBe(100);
    const atraxa = results.find((r) => r.displayName === 'Atraxa');
    if (atraxa) {
      expect(atraxa.score).toBeLessThan(100);
    }
  });

  it('topK: default returns at most 5', async () => {
    const index = await buildFixtureIndex();
    const sig = buildCardNameSignature('Atraxa').baseNameSignature;
    const results = resolveProperNounBySignature(index, sig);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('topK: option returns at most 2', async () => {
    const index = await buildFixtureIndex();
    const sig = buildCardNameSignature('Atraxa').baseNameSignature;
    const results = resolveProperNounBySignature(index, sig, { topK: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('filters out candidates with score <= 0', async () => {
    const index = await buildFixtureIndex();
    const impossibleSig = ['BRIGHT', 'BRIGHT', 'BRIGHT', 'BRIGHT', 'BRIGHT', 'BRIGHT', 'BRIGHT'] as const;
    const results = resolveProperNounBySignature(index, impossibleSig);
    expect(results.every((r) => r.score > 0)).toBe(true);
  });

  it('stable ordering: ties broken by displayName ascending', async () => {
    const jsonl = [
      JSON.stringify({ doc_id: 'x', name: 'Ee', norm: 'ee', aliases_norm: [] }),
      JSON.stringify({ doc_id: 'x', name: 'Ea', norm: 'ea', aliases_norm: [] }),
    ].join('\n');
    const reader = createReader(jsonl);
    const index = await buildResolverIndex(reader, 'x.jsonl');
    const sig = buildCardNameSignature('Ea').baseNameSignature;
    expect(sig).toEqual(buildCardNameSignature('Ee').baseNameSignature);
    const results = resolveProperNounBySignature(index, sig);
    expect(results.length).toBe(2);
    expect(results[0]!.displayName).toBe('Ea');
    expect(results[1]!.displayName).toBe('Ee');
  });

  it('same input and index produce same order on repeated calls', async () => {
    const index = await buildFixtureIndex();
    const sig = buildCardNameSignature('Atraxa').baseNameSignature.slice(0, 2);
    const a = resolveProperNounBySignature(index, sig);
    const b = resolveProperNounBySignature(index, sig);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.displayName).toBe(b[i]!.displayName);
      expect(a[i]!.score).toBe(b[i]!.score);
    }
  });

  it('result shape is NameShapingResolverCandidate', async () => {
    const index = await buildFixtureIndex();
    const sig = buildCardNameSignature('Urborg').baseNameSignature;
    const results = resolveProperNounBySignature(index, sig);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const c = results[0]!;
    expect(typeof c.cardId).toBe('string');
    expect(typeof c.displayName).toBe('string');
    expect(typeof c.score).toBe('number');
    expect(Array.isArray(c.signature)).toBe(true);
    expect(c.matchReason === undefined || typeof c.matchReason === 'string').toBe(true);
  });
});

describe('scoreSignatureMatch', () => {
  it('exact match returns 100 and exact reason', () => {
    const sig = ['BRIGHT', 'HARD'] as const;
    const result = scoreSignatureMatch(sig, sig);
    expect(result.score).toBe(100);
    expect(result.matchReason).toBe('exact');
  });

  it('input prefix of base returns prefix reason and 90 minus length delta', () => {
    const base = ['BRIGHT', 'HARD', 'LIQUID'] as const;
    const input = base.slice(0, 2);
    const result = scoreSignatureMatch(input, base);
    expect(result.matchReason).toBe('prefix');
    expect(result.score).toBe(90 - 1);
  });

  it('base prefix of input returns prefix_target_shorter and 80 minus length delta', () => {
    const base = ['BRIGHT', 'HARD'] as const;
    const input = ['BRIGHT', 'HARD', 'LIQUID'] as const;
    const result = scoreSignatureMatch(input, base);
    expect(result.matchReason).toBe('prefix_target_shorter');
    expect(result.score).toBe(80 - 1);
  });

  it('ordered overlap uses explicit arithmetic and clamps to non-negative', () => {
    const base = ['HARD', 'BRIGHT', 'HARD', 'LIQUID', 'ROUND', 'HARD'] as const;
    const input = ['HARD', 'BRIGHT', 'SOFT'] as const;
    const result = scoreSignatureMatch(input, base);
    expect(result.matchReason).toBe('overlap');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('no overlap returns score 0', () => {
    const input = ['SOFT', 'SOFT', 'SOFT'] as const;
    const base = ['HARD', 'HARD', 'HARD'] as const;
    const result = scoreSignatureMatch(input, base);
    expect(result.score).toBe(0);
    expect(result.matchReason).toBe('overlap');
  });
});
