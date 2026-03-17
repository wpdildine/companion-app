/**
 * useNameShapingState: state owner hook and explicit update actions.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useNameShapingState } from './useNameShapingState';
import type { NameShapingState } from '../foundation/nameShapingTypes';

let currentState: NameShapingState | null = null;
let currentActions: ReturnType<typeof useNameShapingState>['actions'] | null = null;

function Harness() {
  const { state, actions } = useNameShapingState();
  currentState = state;
  currentActions = actions;
  return null;
}

function createHarness(): {
  getState: () => NameShapingState;
  actions: NonNullable<typeof currentActions>;
  unmount: () => void;
} {
  currentState = null;
  currentActions = null;
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Harness));
  });
  if (!currentActions || !currentState) {
    throw new Error('useNameShapingState harness failed to initialize.');
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

describe('useNameShapingState', () => {
  it('default initial state matches NameShapingState', () => {
    const { getState } = createHarness();
    const state = getState();
    expect(state.enabled).toBe(false);
    expect(state.rawEmittedSequence).toEqual([]);
    expect(state.normalizedSignature).toEqual([]);
    expect(state.committedSignature).toEqual([]);
    expect(state.resolverCandidates).toEqual([]);
    expect(state.selectedCandidate).toBe(null);
    expect(state.activeSelector).toBe(null);
  });

  it('enable() sets enabled to true', () => {
    const { getState, actions } = createHarness();
    expect(getState().enabled).toBe(false);
    act(() => {
      actions.enable();
    });
    expect(getState().enabled).toBe(true);
  });

  it('disable() sets enabled to false and clears all other fields', () => {
    const { getState, actions } = createHarness();
    act(() => {
      actions.enable();
      actions.appendEmittedToken({ selector: 'BRIGHT' });
      actions.setActiveSelector('SOFT');
    });
    expect(getState().enabled).toBe(true);
    expect(getState().rawEmittedSequence).toHaveLength(1);
    act(() => {
      actions.disable();
    });
    expect(getState().enabled).toBe(false);
    expect(getState().rawEmittedSequence).toHaveLength(0);
    expect(getState().normalizedSignature).toEqual([]);
    expect(getState().committedSignature).toEqual([]);
    expect(getState().resolverCandidates).toEqual([]);
    expect(getState().selectedCandidate).toBe(null);
    expect(getState().activeSelector).toBe(null);
  });

  it('clear() resets feature data but preserves current enabled', () => {
    const { getState, actions } = createHarness();
    act(() => {
      actions.enable();
      actions.appendEmittedToken({ selector: 'BRIGHT' });
      actions.setResolverCandidates([
        {
          cardId: '1',
          displayName: 'Test',
          score: 1,
          signature: ['BRIGHT'],
        },
      ]);
    });
    expect(getState().enabled).toBe(true);
    expect(getState().rawEmittedSequence).toHaveLength(1);
    expect(getState().resolverCandidates).toHaveLength(1);
    act(() => {
      actions.clear();
    });
    expect(getState().enabled).toBe(true);
    expect(getState().rawEmittedSequence).toHaveLength(0);
    expect(getState().committedSignature).toHaveLength(0);
    expect(getState().resolverCandidates).toHaveLength(0);
    expect(getState().selectedCandidate).toBe(null);
    expect(getState().activeSelector).toBe(null);
  });

  it('appendEmittedToken preserves sequence order and repetition', () => {
    const { getState, actions } = createHarness();
    act(() => {
      actions.appendEmittedToken({ selector: 'BRIGHT' });
      actions.appendEmittedToken({ selector: 'HARD' });
      actions.appendEmittedToken({ selector: 'BRIGHT' });
    });
    const seq = getState().rawEmittedSequence;
    expect(seq).toHaveLength(3);
    expect(seq[0].selector).toBe('BRIGHT');
    expect(seq[1].selector).toBe('HARD');
    expect(seq[2].selector).toBe('BRIGHT');
  });

  it('commitBreak() appends one token { selector: "BREAK" } with no timestamp', () => {
    const { getState, actions } = createHarness();
    act(() => {
      actions.appendEmittedToken({ selector: 'SOFT' });
      actions.commitBreak();
    });
    const seq = getState().rawEmittedSequence;
    expect(seq).toHaveLength(2);
    expect(seq[1]).toEqual({ selector: 'BREAK' });
    expect('timestamp' in seq[1]).toBe(false);
  });

  it('commitResolution() snapshots the current normalized signature', () => {
    const { getState, actions } = createHarness();
    act(() => {
      actions.appendEmittedToken({ selector: 'BRIGHT' });
      actions.appendEmittedToken({ selector: 'ROUND' });
      actions.commitResolution();
    });
    expect(getState().normalizedSignature).toEqual(['BRIGHT', 'ROUND']);
    expect(getState().committedSignature).toEqual(['BRIGHT', 'ROUND']);
  });

  it('setResolverCandidates stores shallow copy; contents match', () => {
    const { getState, actions } = createHarness();
    const candidates = [
      {
        cardId: 'id1',
        displayName: 'Card One',
        score: 1,
        signature: ['BRIGHT', 'HARD'] as const,
      },
    ];
    act(() => {
      actions.setResolverCandidates(candidates);
    });
    const stored = getState().resolverCandidates;
    expect(stored).toHaveLength(1);
    expect(stored[0].cardId).toBe('id1');
    expect(stored[0].displayName).toBe('Card One');
    expect(stored[0].signature).toEqual(['BRIGHT', 'HARD']);
    expect(stored).not.toBe(candidates);
  });

  it('setSelectedCandidate stores and clears correctly', () => {
    const { getState, actions } = createHarness();
    const candidate = {
      cardId: 'id1',
      displayName: 'Urza',
      score: 1,
      signature: ['ROUND', 'SOFT'] as const,
    };
    act(() => {
      actions.setSelectedCandidate(candidate);
    });
    expect(getState().selectedCandidate).toBe(candidate);
    act(() => {
      actions.setSelectedCandidate(null);
    });
    expect(getState().selectedCandidate).toBe(null);
  });

  it('setActiveSelector updates activeSelector', () => {
    const { getState, actions } = createHarness();
    expect(getState().activeSelector).toBe(null);
    act(() => {
      actions.setActiveSelector('LIQUID');
    });
    expect(getState().activeSelector).toBe('LIQUID');
    act(() => {
      actions.setActiveSelector(null);
    });
    expect(getState().activeSelector).toBe(null);
  });

});
