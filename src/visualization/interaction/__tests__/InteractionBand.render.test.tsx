import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { InteractionBand } from '../InteractionBand';

type MockPanHandlers = {
  onTouchesDown?: (
    event: unknown,
    stateManager: { activate: () => void; fail: () => void },
  ) => void;
  onStart?: (event: { x: number; y: number }) => void;
  onUpdate?: (event: { x: number; y: number }) => void;
  onEnd?: (event: { x: number; y: number }, success: boolean) => void;
  onFinalize?: (event: unknown, success: boolean) => void;
};

type MockPanGesture = {
  handlers: MockPanHandlers;
  runOnJS: (enabled: boolean) => MockPanGesture;
  manualActivation: (enabled: boolean) => MockPanGesture;
  onTouchesDown: (
    cb: NonNullable<MockPanHandlers['onTouchesDown']>,
  ) => MockPanGesture;
  onStart: (cb: NonNullable<MockPanHandlers['onStart']>) => MockPanGesture;
  onUpdate: (cb: NonNullable<MockPanHandlers['onUpdate']>) => MockPanGesture;
  onEnd: (cb: NonNullable<MockPanHandlers['onEnd']>) => MockPanGesture;
  onFinalize: (
    cb: NonNullable<MockPanHandlers['onFinalize']>,
  ) => MockPanGesture;
};

let lastGesture: MockPanGesture | null = null;

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');

  const createPanGesture = (): MockPanGesture => {
    const handlers: MockPanHandlers = {};
    const gesture: MockPanGesture = {
      handlers,
      runOnJS: () => gesture,
      manualActivation: () => gesture,
      onTouchesDown: (cb) => {
        handlers.onTouchesDown = cb;
        return gesture;
      },
      onStart: (cb) => {
        handlers.onStart = cb;
        return gesture;
      },
      onUpdate: (cb) => {
        handlers.onUpdate = cb;
        return gesture;
      },
      onEnd: (cb) => {
        handlers.onEnd = cb;
        return gesture;
      },
      onFinalize: (cb) => {
        handlers.onFinalize = cb;
        return gesture;
      },
    };
    lastGesture = gesture;
    return gesture;
  };

  return {
    Gesture: {
      Pan: createPanGesture,
    },
    GestureDetector: ({
      children,
    }: {
      gesture: MockPanGesture;
      children: React.ReactNode;
    }) => <View testID="gesture-detector">{children}</View>,
  };
});

jest.mock('../../../shared/logging', () => ({
  logInfo: jest.fn(),
}));

jest.mock('react-native-reanimated', () => ({
  runOnJS:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
}));

describe('InteractionBand render path', () => {
  const createVisualizationRef = () => ({
    current: {
      canvasWidth: 200,
      canvasHeight: 400,
      touchFieldActive: false,
      touchFieldNdc: null,
      touchFieldStrength: 0,
      zoneArmed: null,
      scene: {
        zones: {
          layout: {
            bandTopInsetPx: 112,
          },
        },
      },
    },
  });

  beforeEach(() => {
    lastGesture = null;
  });

  it('attaches the detector to a non-collapsable host and preserves the inset bounds', () => {
    const visualizationRef = createVisualizationRef();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <InteractionBand visualizationRef={visualizationRef} />,
      );
    });

    const host = renderer!.root.findByProps({ collapsable: false });
    expect(host.props.style).toEqual(
      expect.objectContaining({ top: 0, left: 0, right: 0, bottom: 0 }),
    );

    const band = renderer!.root
      .findAllByType(View)
      .find((node) => node.props.onLayout != null);
    expect(band).toBeDefined();
    expect(band?.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
        }),
        expect.objectContaining({ top: 112 }),
      ]),
    );
  });

  it('runs the live gesture path and avoids cancel after a successful end', () => {
    const visualizationRef = createVisualizationRef();
    const onClusterRelease = jest.fn();
    const nameShapingCapture = {
      onTouchStart: jest.fn(),
      onTouchMove: jest.fn(),
      onTouchEnd: jest.fn(),
      onTouchCancel: jest.fn(),
    };

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <InteractionBand
          visualizationRef={visualizationRef}
          onClusterRelease={onClusterRelease}
          nameShapingCapture={nameShapingCapture}
        />,
      );
    });

    const band = renderer!.root
      .findAllByType(View)
      .find((node) => node.props.onLayout != null);
    expect(band).toBeDefined();

    act(() => {
      band!.props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 288 } },
      });
    });

    const gesture = lastGesture;
    expect(gesture).not.toBeNull();

    const stateManager = { activate: jest.fn(), fail: jest.fn() };
    act(() => {
      gesture!.handlers.onTouchesDown?.({}, stateManager);
      gesture!.handlers.onStart?.({ x: 180, y: 100 });
      gesture!.handlers.onEnd?.({ x: 180, y: 100 }, true);
      gesture!.handlers.onFinalize?.({}, true);
    });

    expect(stateManager.activate).toHaveBeenCalledTimes(1);
    expect(stateManager.fail).not.toHaveBeenCalled();
    expect(nameShapingCapture.onTouchStart).toHaveBeenCalledTimes(1);
    expect(nameShapingCapture.onTouchEnd).toHaveBeenCalledTimes(1);
    expect(nameShapingCapture.onTouchCancel).not.toHaveBeenCalled();
    expect(onClusterRelease).not.toHaveBeenCalled();
  });

  it('uses cancel cleanup only when finalize reports an unsuccessful gesture', () => {
    const visualizationRef = createVisualizationRef();
    const nameShapingCapture = {
      onTouchStart: jest.fn(),
      onTouchMove: jest.fn(),
      onTouchEnd: jest.fn(),
      onTouchCancel: jest.fn(),
    };

    act(() => {
      TestRenderer.create(
        <InteractionBand
          visualizationRef={visualizationRef}
          nameShapingCapture={nameShapingCapture}
        />,
      );
    });

    const gesture = lastGesture;
    expect(gesture).not.toBeNull();

    act(() => {
      gesture!.handlers.onFinalize?.({}, false);
    });

    expect(nameShapingCapture.onTouchCancel).toHaveBeenCalledTimes(1);
    expect(nameShapingCapture.onTouchEnd).not.toHaveBeenCalled();
  });
});
