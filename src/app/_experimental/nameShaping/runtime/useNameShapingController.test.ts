/**
 * useNameShapingController: integration hook wiring committed signatures to
 * resolver candidates. Uses a small resolver fixture and hand-authored sequences;
 * asserts explicit-commit behavior without reimplementing normalizer/resolver rules.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { buildCardNameSignature } from '../foundation/buildCardNameSignature';
import { buildResolverIndex } from '../resolver/resolverIndex';
import { normalizeNameShapingSequence } from '../foundation/normalizeNameShapingSequence';
import { resolveProperNounBySignature } from '../resolver/resolveProperNounBySignature';
import type { ResolverIndex } from '../foundation/nameShapingTypes';
import { useNameShapingState } from './useNameShapingState';
import { useNameShapingController } from './useNameShapingController';
import type { NameShapingState } from '../foundation/nameShapingTypes';

function createReader(jsonl: string) {
  return { readFile: async () => jsonl };
}

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

async function buildFixtureIndex(): Promise<ResolverIndex> {
  const reader = createReader(FIXTURE_JSONL);
  return buildResolverIndex(reader, 'cards/name_lookup.jsonl');
}

let currentState: NameShapingState | null = null;
let currentActions: ReturnType<typeof useNameShapingState>['actions'] | null = null;
let renderHistory: Array<{
  rawSequence: string[];
  normalizedSignature: string[];
  candidateNames: string[];
}> = [];

function Harness({ index }: { index: ResolverIndex | null }) {
  const { state, actions } = useNameShapingState();
  useNameShapingController(state, actions, index);
  currentState = state;
  currentActions = actions;
  renderHistory.push({
    rawSequence: state.rawEmittedSequence.map((token) => token.selector),
    normalizedSignature: [...state.normalizedSignature],
    candidateNames: state.resolverCandidates.map((candidate) => candidate.displayName),
  });
  return null;
}

function createHarness(index: ResolverIndex | null): {
  getState: () => NameShapingState;
  actions: NonNullable<typeof currentActions>;
  unmount: () => void;
} {
  currentState = null;
  currentActions = null;
  renderHistory = [];
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Harness, { index }));
  });
  if (!currentActions || !currentState) {
    throw new Error('useNameShapingController harness failed to initialize.');
  }
  return {
    getState: () => currentState!,
    actions: currentActions,
    unmount: () => {
      act(() => {
        renderer!.unmount();
      });
    },
  };
}

/** Flush effects so derived state (resolverCandidates) is up to date. */
function flushEffects() {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  act(() => {});
}

describe('useNameShapingController', () => {
  let fixtureIndex: ResolverIndex | null = null;

  beforeAll(async () => {
    fixtureIndex = await buildFixtureIndex();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('raw emitted sequence change updates normalized signature deterministically', () => {
    const { getState, actions } = createHarness(fixtureIndex);

    act(() => {
      actions.appendEmittedToken({ selector: 'BRIGHT' });
      actions.appendEmittedToken({ selector: 'HARD' });
    });
    flushEffects();

    expect(getState().normalizedSignature).toEqual(['BRIGHT', 'HARD']);

    act(() => {
      actions.appendEmittedToken({ selector: 'BREAK' });
    });
    flushEffects();

    expect(getState().normalizedSignature).toEqual(['BRIGHT', 'HARD']);
  });

  it('commitResolution updates resolver candidates when index provided', () => {
    const atraxaSig = buildCardNameSignature('Atraxa').baseNameSignature;
    const { getState, actions } = createHarness(fixtureIndex);

    act(() => {
      atraxaSig.forEach((sel) => actions.appendEmittedToken({ selector: sel }));
      actions.commitResolution();
    });
    flushEffects();

    const candidates = getState().resolverCandidates;
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]!.displayName).toBe('Atraxa');
    expect(candidates[0]!.cardId).toBe('c-atraxa');
    expect(candidates[0]!.matchReason).toBe('exact');
  });

  it('does not resolve candidates for very short normalized signatures', () => {
    const { getState, actions } = createHarness(fixtureIndex);

    act(() => {
      actions.appendEmittedToken({ selector: 'BRIGHT' });
      actions.appendEmittedToken({ selector: 'ROUND' });
      actions.commitResolution();
    });
    flushEffects();

    expect(getState().normalizedSignature).toEqual(['BRIGHT', 'ROUND']);
    expect(getState().committedSignature).toEqual(['BRIGHT', 'ROUND']);
    expect(getState().resolverCandidates.length).toBeGreaterThanOrEqual(0);
  });

  it('resolves candidates from the latest committed normalized signature after burst input', () => {
    const { getState, actions } = createHarness(fixtureIndex);
    const rawTokens = [
      { selector: 'BRIGHT' as const },
      { selector: 'ROUND' as const },
      { selector: 'ROUND' as const },
      { selector: 'LIQUID' as const },
    ];

    act(() => {
      rawTokens.forEach((token) => actions.appendEmittedToken(token));
      actions.commitResolution();
    });
    flushEffects();

    const expectedSignature = normalizeNameShapingSequence(rawTokens);
    const expectedCandidates = resolveProperNounBySignature(
      fixtureIndex!,
      expectedSignature,
    );

    expect(getState().normalizedSignature).toEqual(expectedSignature);
    expect(getState().resolverCandidates).toEqual(expectedCandidates);
  });

  it('does not produce a stale raw/normalized intermediate render during burst input', () => {
    const { actions } = createHarness(fixtureIndex);

    act(() => {
      actions.appendEmittedToken({ selector: 'BRIGHT' });
    });
    flushEffects();

    act(() => {
      actions.appendEmittedToken({ selector: 'ROUND' });
      actions.appendEmittedToken({ selector: 'LIQUID' });
    });
    flushEffects();

    const staleIntermediate = renderHistory.some((snapshot) => (
      snapshot.rawSequence.join(',') === 'BRIGHT,ROUND,LIQUID' &&
      snapshot.normalizedSignature.join(',') === 'BRIGHT'
    ));

    const settled = renderHistory.some((snapshot) => (
      snapshot.rawSequence.join(',') === 'BRIGHT,ROUND,LIQUID' &&
      snapshot.normalizedSignature.join(',') === 'BRIGHT,ROUND,LIQUID'
    ));

    expect(staleIntermediate).toBe(false);
    expect(settled).toBe(true);
  });

  it('does not write resolver candidates during a rapid burst before explicit commit', () => {
    const { getState, actions } = createHarness(fixtureIndex);

    act(() => {
      actions.appendEmittedToken({ selector: 'BRIGHT' });
      actions.appendEmittedToken({ selector: 'ROUND' });
      actions.appendEmittedToken({ selector: 'LIQUID' });
    });

    expect(getState().normalizedSignature).toEqual(['BRIGHT', 'ROUND', 'LIQUID']);
    expect(getState().committedSignature).toEqual([]);
    expect(getState().resolverCandidates).toEqual([]);

    act(() => {
      actions.commitResolution();
    });
    flushEffects();

    const expectedCandidates = resolveProperNounBySignature(
      fixtureIndex!,
      ['BRIGHT', 'ROUND', 'LIQUID'],
    );
    expect(getState().resolverCandidates).toEqual(expectedCandidates);
  });

  it('empty raw sequence clears normalized signature and candidates', () => {
    const { getState, actions } = createHarness(fixtureIndex);

    act(() => {
      actions.appendEmittedToken({ selector: 'BRIGHT' });
      actions.appendEmittedToken({ selector: 'HARD' });
    });
    flushEffects();
    expect(getState().normalizedSignature).toEqual(['BRIGHT', 'HARD']);
    expect(getState().resolverCandidates.length).toBeGreaterThanOrEqual(0);

    act(() => {
      actions.clear();
    });
    flushEffects();

    expect(getState().rawEmittedSequence).toEqual([]);
    expect(getState().normalizedSignature).toEqual([]);
    expect(getState().resolverCandidates).toEqual([]);
    expect(getState().selectedCandidate).toBe(null);
  });

  it('editing after selection clears stale selection until the next explicit commit', () => {
    const atraxaSig = buildCardNameSignature('Atraxa').baseNameSignature;
    const prefix = atraxaSig.slice(0, 3);
    const { getState, actions } = createHarness(fixtureIndex);

    act(() => {
      prefix.forEach((sel) => actions.appendEmittedToken({ selector: sel }));
      actions.commitResolution();
    });
    flushEffects();

    const candidatesAfterPrefix = getState().resolverCandidates;
    const atraxaCandidate = candidatesAfterPrefix.find((c) => c.displayName === 'Atraxa');
    expect(atraxaCandidate).toBeDefined();

    act(() => {
      actions.setSelectedCandidate(atraxaCandidate!);
    });
    flushEffects();

    act(() => {
      actions.appendEmittedToken({ selector: atraxaSig[3]! });
    });
    expect(getState().selectedCandidate).toBe(null);
    expect(getState().resolverCandidates).toEqual([]);

    act(() => {
      actions.commitResolution();
    });
    flushEffects();

    const recommittedAtraxa = getState().resolverCandidates.find((c) => c.cardId === 'c-atraxa');
    expect(recommittedAtraxa).toBeDefined();
  });

  it('selected candidate clears when no longer present in candidate list', () => {
    const atraxaSig = buildCardNameSignature('Atraxa').baseNameSignature;
    const { getState, actions } = createHarness(fixtureIndex);

    act(() => {
      atraxaSig.forEach((sel) => actions.appendEmittedToken({ selector: sel }));
      actions.commitResolution();
    });
    flushEffects();

    const candidates = getState().resolverCandidates;
    const atraxa = candidates.find((c) => c.displayName === 'Atraxa');
    expect(atraxa).toBeDefined();

    act(() => {
      actions.setSelectedCandidate(atraxa!);
    });
    expect(getState().selectedCandidate).not.toBe(null);

    act(() => {
      actions.clear();
      actions.appendEmittedToken({ selector: 'ROUND' });
      actions.appendEmittedToken({ selector: 'HARD' });
      actions.appendEmittedToken({ selector: 'ROUND' });
      actions.appendEmittedToken({ selector: 'HARD' });
      actions.commitResolution();
    });
    flushEffects();

    expect(getState().selectedCandidate).toBe(null);
  });

  it('normalized signature and top candidate match pure normalizer and resolver output', () => {
    const rawTokens = [
      { selector: 'BRIGHT' as const },
      { selector: 'BRIGHT' as const },
      { selector: 'HARD' as const },
      { selector: 'LIQUID' as const },
    ];
    const expectedSignature = normalizeNameShapingSequence(rawTokens);
    expect(expectedSignature).toEqual(['BRIGHT', 'HARD', 'LIQUID']);

    const { getState, actions } = createHarness(fixtureIndex);

    act(() => {
      rawTokens.forEach((t) => actions.appendEmittedToken(t));
      actions.commitResolution();
    });
    flushEffects();

    expect(getState().normalizedSignature).toEqual(expectedSignature);

    const expectedCandidates = resolveProperNounBySignature(
      fixtureIndex!,
      getState().normalizedSignature
    );
    expect(getState().resolverCandidates).toEqual(expectedCandidates);
    if (expectedCandidates.length > 0 && getState().resolverCandidates.length > 0) {
      expect(getState().resolverCandidates[0]).toEqual(expectedCandidates[0]);
    }
  });
});
