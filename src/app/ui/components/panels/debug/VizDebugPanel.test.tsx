import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { VizDebugPanel } from './VizDebugPanel';

jest.mock('../../../../../shared/logging', () => ({
  logInfo: jest.fn(),
}));

jest.mock('../../../../../visualization', () => {
  const ReactNative = require('react-native');
  return {
    DevPanel: () => <ReactNative.View testID="dev-panel-stub" />,
  };
});

function walkInstances(
  node: TestRenderer.ReactTestInstance,
  visit: (n: TestRenderer.ReactTestInstance) => void,
): void {
  visit(node);
  const ch = node.children;
  if (!ch) return;
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (c != null && typeof c === 'object' && 'props' in c) {
      walkInstances(c as TestRenderer.ReactTestInstance, visit);
    }
  }
}

function findByTestId(
  root: TestRenderer.ReactTestInstance,
  testID: string,
): TestRenderer.ReactTestInstance | null {
  let hit: TestRenderer.ReactTestInstance | null = null;
  walkInstances(root, n => {
    if (n.props?.testID === testID) hit = n;
  });
  return hit;
}

function findOnPressSubtreeContainingText(
  root: TestRenderer.ReactTestInstance,
  textMatch: string | ((s: string) => boolean),
): TestRenderer.ReactTestInstance | null {
  const candidates: TestRenderer.ReactTestInstance[] = [];
  walkInstances(root, n => {
    if (typeof n.props?.onPress === 'function') {
      candidates.push(n);
    }
  });
  const match =
    typeof textMatch === 'function'
      ? textMatch
      : (s: string) => s === textMatch;
  for (const c of candidates) {
    let hit = false;
    walkInstances(c, n => {
      if (n.type === Text && typeof n.props.children === 'string') {
        if (match(n.props.children)) hit = true;
      }
    });
    if (hit) return c;
  }
  return null;
}

/** Section bodies mount only when expanded; open Speech Lab before interacting. */
function expandSpeechLabSection(root: TestRenderer.ReactTestInstance): void {
  const header = findOnPressSubtreeContainingText(root, 'Speech Lab');
  expect(header).toBeTruthy();
  act(() => {
    header!.props.onPress?.();
  });
}

describe('VizDebugPanel Speech Lab', () => {
  const baseProps = {
    visualizationRef: { current: null } as React.RefObject<null>,
    onClose: jest.fn(),
    stubCardsEnabled: false,
    stubRulesEnabled: false,
    onToggleStubCards: jest.fn(),
    onToggleStubRules: jest.fn(),
    onSpeechLabPlay: jest.fn(),
    onSpeechLabCancel: jest.fn(),
    speechLabReadout: { lifecycle: 'idle' as const, error: null as string | null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invokes onSpeechLabPlay with default posture and preset text when Play is pressed', () => {
    let root: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<VizDebugPanel {...baseProps} />);
    });
    expandSpeechLabSection(root!.root);
    const row = findOnPressSubtreeContainingText(root!.root, 'Play');
    expect(row).toBeTruthy();
    act(() => {
      row!.props.onPress?.();
    });
    expect(baseProps.onSpeechLabPlay).toHaveBeenCalledTimes(1);
    expect(baseProps.onSpeechLabPlay).toHaveBeenCalledWith(
      expect.any(String),
      { posture: 'default' },
    );
  });

  it('invokes onSpeechLabPlay with treated after treated row sets posture', () => {
    let root: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<VizDebugPanel {...baseProps} />);
    });
    expandSpeechLabSection(root!.root);
    const treatedRow = findOnPressSubtreeContainingText(root!.root, 'treated');
    expect(treatedRow).toBeTruthy();
    act(() => {
      treatedRow!.props.onPress?.();
    });
    const playRow = findOnPressSubtreeContainingText(root!.root, 'Play');
    expect(playRow).toBeTruthy();
    act(() => {
      playRow!.props.onPress?.();
    });
    expect(baseProps.onSpeechLabPlay).toHaveBeenLastCalledWith(
      expect.any(String),
      { posture: 'treated' },
    );
  });

  it('invokes onSpeechLabCancel when Stop row is pressed', () => {
    let root: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<VizDebugPanel {...baseProps} />);
    });
    expandSpeechLabSection(root!.root);
    const stopRow = findOnPressSubtreeContainingText(
      root!.root,
      s => s.includes('Stop') && s.includes('cancel'),
    );
    expect(stopRow).toBeTruthy();
    act(() => {
      stopRow!.props.onPress?.();
    });
    expect(baseProps.onSpeechLabCancel).toHaveBeenCalledTimes(1);
  });

  it('sends treatedDebugRenderOverrides on Play when treated and gain field is set', () => {
    let root: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<VizDebugPanel {...baseProps} />);
    });
    expandSpeechLabSection(root!.root);
    const treatedRow = findOnPressSubtreeContainingText(root!.root, 'treated');
    act(() => {
      treatedRow!.props.onPress?.();
    });
    const gainInput = findByTestId(root!.root, 'speech-lab-treated-gain-db');
    expect(gainInput).toBeTruthy();
    act(() => {
      gainInput!.props.onChangeText?.('3');
    });
    const playRow = findOnPressSubtreeContainingText(root!.root, 'Play');
    act(() => {
      playRow!.props.onPress?.();
    });
    expect(baseProps.onSpeechLabPlay).toHaveBeenLastCalledWith(
      expect.any(String),
      {
        posture: 'treated',
        treatedDebugRenderOverrides: { renderPostGainDb: 3 },
      },
    );
  });

  it('reset clears treated overrides so Play omits treatedDebugRenderOverrides', () => {
    let root: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(<VizDebugPanel {...baseProps} />);
    });
    expandSpeechLabSection(root!.root);
    const treatedRow = findOnPressSubtreeContainingText(root!.root, 'treated');
    act(() => {
      treatedRow!.props.onPress?.();
    });
    const gainInput = findByTestId(root!.root, 'speech-lab-treated-gain-db');
    act(() => {
      gainInput!.props.onChangeText?.('5');
    });
    const resetRow = findOnPressSubtreeContainingText(
      root!.root,
      s => s.includes('Reset') && s.includes('treated'),
    );
    expect(resetRow).toBeTruthy();
    act(() => {
      resetRow!.props.onPress?.();
    });
    const playRow = findOnPressSubtreeContainingText(root!.root, 'Play');
    act(() => {
      playRow!.props.onPress?.();
    });
    expect(baseProps.onSpeechLabPlay).toHaveBeenLastCalledWith(
      expect.any(String),
      { posture: 'treated' },
    );
  });
});
