/**
 * Regression: default shell keeps GL layer non-interactive so InteractionBand / overlays own touches.
 */

jest.mock('./VisualizationCanvas', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    VisualizationCanvas: (props: Record<string, unknown>) =>
      React.createElement(View, {
        testID: 'mock-visualization-canvas',
        ...props,
      }),
  };
});

import React, { createRef } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { createDefaultVisualizationRef } from '../../runtime/createDefaultRef';
import type { VisualizationEngineRef } from '../../runtime/runtimeTypes';
import { VisualizationSurface } from './VisualizationSurface';

describe('VisualizationSurface', () => {
  it('sets pointerEvents="none" on the canvas wrapper View', () => {
    const ref = createRef<VisualizationEngineRef | null>();
    ref.current = createDefaultVisualizationRef();

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <VisualizationSurface
          visualizationRef={ref}
          controlsEnabled={false}
          inputEnabled
          clusterZoneHighlights={false}
        >
          <Text>child</Text>
        </VisualizationSurface>,
      );
    });

    const mockCanvas = tree.root.findByProps({
      testID: 'mock-visualization-canvas',
    });
    let p: TestRenderer.ReactTestInstance | null = mockCanvas.parent;
    let foundNone = false;
    while (p != null) {
      if (p.props.pointerEvents === 'none') {
        foundNone = true;
        break;
      }
      p = p.parent;
    }
    expect(foundNone).toBe(true);

    act(() => {
      tree.unmount();
    });
  });

  it('passes canvasTouchPolicy="none" to VisualizationCanvas (shell path)', () => {
    const ref = createRef<VisualizationEngineRef | null>();
    ref.current = createDefaultVisualizationRef();

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <VisualizationSurface
          visualizationRef={ref}
          controlsEnabled={false}
          inputEnabled
          clusterZoneHighlights={false}
        >
          <Text>child</Text>
        </VisualizationSurface>,
      );
    });

    const mockCanvas = tree.root.findByProps({
      testID: 'mock-visualization-canvas',
    });
    expect(mockCanvas.props.canvasTouchPolicy).toBe('none');

    act(() => {
      tree.unmount();
    });
  });
});
