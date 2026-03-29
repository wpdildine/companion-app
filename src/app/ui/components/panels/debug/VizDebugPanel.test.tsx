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
});
