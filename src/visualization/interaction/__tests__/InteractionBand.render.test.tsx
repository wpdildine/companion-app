import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { InteractionBand } from '../InteractionBand';

type MockPanHandlers = {
  onTouchesDown?: (
    event: { changedTouches: Array<{ x: number; y: number }> },
    stateManager: { activate: () => void; fail: () => void },
  ) => void;
  onTouchesUp?: (event: {
    changedTouches: Array<{ x: number; y: number }>;
  }) => void;
  onUpdate?: (event: { x: number; y: number }) => void;
  onFinalize?: (event: unknown, success: boolean) => void;
};

type MockPanGesture = {
  handlers: MockPanHandlers;
  runOnJS: (enabled: boolean) => MockPanGesture;
  manualActivation: (enabled: boolean) => MockPanGesture;
  onTouchesDown: (
    cb: NonNullable<MockPanHandlers['onTouchesDown']>,
  ) => MockPanGesture;
  onTouchesUp: (
    cb: NonNullable<MockPanHandlers['onTouchesUp']>,
  ) => MockPanGesture;
  onUpdate: (cb: NonNullable<MockPanHandlers['onUpdate']>) => MockPanGesture;
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
      onTouchesUp: (cb) => {
        handlers.onTouchesUp = cb;
        return gesture;
      },
      onUpdate: (cb) => {
        handlers.onUpdate = cb;
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
  useSharedValue: <T,>(value: T) => ({ value }),
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
      gesture!.handlers.onTouchesDown?.(
        { changedTouches: [{ x: 180, y: 100 }] },
        stateManager,
      );
      gesture!.handlers.onTouchesUp?.({
        changedTouches: [{ x: 180, y: 100 }],
      });
      gesture!.handlers.onFinalize?.({}, false);
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
    const stateManager = { activate: jest.fn(), fail: jest.fn() };

    act(() => {
      gesture!.handlers.onTouchesDown?.(
        { changedTouches: [{ x: 180, y: 100 }] },
        stateManager,
      );
      gesture!.handlers.onFinalize?.({}, false);
    });

    expect(nameShapingCapture.onTouchCancel).toHaveBeenCalledTimes(1);
    expect(nameShapingCapture.onTouchEnd).not.toHaveBeenCalled();
  });

  it('does not cancel after touchesUp already handled the end', () => {
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
    const stateManager = { activate: jest.fn(), fail: jest.fn() };

    act(() => {
      gesture!.handlers.onTouchesDown?.(
        { changedTouches: [{ x: 180, y: 100 }] },
        stateManager,
      );
      gesture!.handlers.onTouchesUp?.({
        changedTouches: [{ x: 180, y: 100 }],
      });
      gesture!.handlers.onFinalize?.({}, false);
    });

    expect(nameShapingCapture.onTouchEnd).toHaveBeenCalledTimes(1);
    expect(nameShapingCapture.onTouchCancel).not.toHaveBeenCalled();
  });

  it('bypasses the hold delay for center-lane touches when busy-audio retry feedback is enabled', () => {
    jest.useFakeTimers();
    const visualizationRef = createVisualizationRef();
    const onCenterHoldAttempt = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <InteractionBand
          visualizationRef={visualizationRef}
          onCenterHoldAttempt={onCenterHoldAttempt}
          centerHoldShouldBypassDelay
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
      gesture!.handlers.onTouchesDown?.(
        { changedTouches: [{ x: 100, y: 100 }] },
        stateManager,
      );
    });

    expect(onCenterHoldAttempt).toHaveBeenCalledTimes(1);
    expect(onCenterHoldAttempt).toHaveBeenCalledWith(expect.any(Function));

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(onCenterHoldAttempt).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('InteractionBand contract (attempt / acceptance / release)', () => {
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

  const layoutEvent = {
    nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 288 } },
  };
  const voiceLanePoint = { x: 100, y: 100 };
  const downEvent = { changedTouches: [voiceLanePoint] };
  const upEvent = { changedTouches: [voiceLanePoint] };

  beforeEach(() => {
    lastGesture = null;
  });

  it('normal accepted hold: attempt -> reportAccepted(true) -> release triggers onCenterHoldEnd', () => {
    jest.useFakeTimers();
    const visualizationRef = createVisualizationRef();
    const onCenterHoldAttempt = jest.fn((reportAccepted: (accepted: boolean) => void) => {
      reportAccepted(true);
    });
    const onCenterHoldEnd = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <InteractionBand
          visualizationRef={visualizationRef}
          onCenterHoldAttempt={onCenterHoldAttempt}
          onCenterHoldEnd={onCenterHoldEnd}
          centerHoldShouldBypassDelay
        />,
      );
    });
    const band = renderer!.root.findAllByType(View).find((n) => n.props.onLayout != null);
    act(() => band!.props.onLayout(layoutEvent));

    const gesture = lastGesture!;
    const stateManager = { activate: jest.fn(), fail: jest.fn() };
    act(() => gesture.handlers.onTouchesDown?.(downEvent, stateManager));
    expect(onCenterHoldAttempt).toHaveBeenCalledTimes(1);

    act(() => gesture.handlers.onTouchesUp?.(upEvent));
    expect(onCenterHoldEnd).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('pending attempt does not cause semantic release on touch up', () => {
    jest.useFakeTimers();
    const visualizationRef = createVisualizationRef();
    const onCenterHoldAttempt = jest.fn();
    const onCenterHoldEnd = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <InteractionBand
          visualizationRef={visualizationRef}
          onCenterHoldAttempt={onCenterHoldAttempt}
          onCenterHoldEnd={onCenterHoldEnd}
          centerHoldShouldBypassDelay
        />,
      );
    });
    const band = renderer!.root.findAllByType(View).find((n) => n.props.onLayout != null);
    act(() => band!.props.onLayout(layoutEvent));

    const gesture = lastGesture!;
    const stateManager = { activate: jest.fn(), fail: jest.fn() };
    act(() => gesture.handlers.onTouchesDown?.(downEvent, stateManager));
    expect(onCenterHoldAttempt).toHaveBeenCalledTimes(1);

    act(() => gesture.handlers.onTouchesUp?.(upEvent));
    expect(onCenterHoldEnd).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('busy retouch: attempt -> reportAccepted(false) -> release does not call onCenterHoldEnd', () => {
    jest.useFakeTimers();
    const visualizationRef = createVisualizationRef();
    const onCenterHoldAttempt = jest.fn((reportAccepted: (accepted: boolean) => void) => {
      reportAccepted(false);
    });
    const onCenterHoldEnd = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <InteractionBand
          visualizationRef={visualizationRef}
          onCenterHoldAttempt={onCenterHoldAttempt}
          onCenterHoldEnd={onCenterHoldEnd}
          centerHoldShouldBypassDelay
        />,
      );
    });
    const band = renderer!.root.findAllByType(View).find((n) => n.props.onLayout != null);
    act(() => band!.props.onLayout(layoutEvent));

    const gesture = lastGesture!;
    const stateManager = { activate: jest.fn(), fail: jest.fn() };
    act(() => gesture.handlers.onTouchesDown?.(downEvent, stateManager));
    act(() => gesture.handlers.onTouchesUp?.(upEvent));

    expect(onCenterHoldAttempt).toHaveBeenCalledTimes(1);
    expect(onCenterHoldEnd).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('short retouch: release before timer -> no reportAccepted(true) -> no onCenterHoldEnd', () => {
    jest.useFakeTimers();
    const visualizationRef = createVisualizationRef();
    const onCenterHoldAttempt = jest.fn();
    const onCenterHoldEnd = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <InteractionBand
          visualizationRef={visualizationRef}
          onCenterHoldAttempt={onCenterHoldAttempt}
          onCenterHoldEnd={onCenterHoldEnd}
        />,
      );
    });
    const band = renderer!.root.findAllByType(View).find((n) => n.props.onLayout != null);
    act(() => band!.props.onLayout(layoutEvent));

    const gesture = lastGesture!;
    const stateManager = { activate: jest.fn(), fail: jest.fn() };
    act(() => gesture.handlers.onTouchesDown?.(downEvent, stateManager));
    expect(onCenterHoldAttempt).not.toHaveBeenCalled();
    act(() => gesture.handlers.onTouchesUp?.(upEvent));

    expect(onCenterHoldEnd).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('blocked attempt: reportAccepted(false) + release does not call onCenterHoldEnd', () => {
    jest.useFakeTimers();
    const visualizationRef = createVisualizationRef();
    const onCenterHoldAttempt = jest.fn((reportAccepted: (accepted: boolean) => void) => {
      reportAccepted(false);
    });
    const onCenterHoldEnd = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <InteractionBand
          visualizationRef={visualizationRef}
          onCenterHoldAttempt={onCenterHoldAttempt}
          onCenterHoldEnd={onCenterHoldEnd}
          centerHoldShouldBypassDelay
        />,
      );
    });
    const band = renderer!.root.findAllByType(View).find((n) => n.props.onLayout != null);
    act(() => band!.props.onLayout(layoutEvent));

    const gesture = lastGesture!;
    const stateManager = { activate: jest.fn(), fail: jest.fn() };
    act(() => gesture.handlers.onTouchesDown?.(downEvent, stateManager));
    act(() => gesture.handlers.onTouchesUp?.(upEvent));

    expect(onCenterHoldEnd).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('accepted start then release: full flow runs and onCenterHoldEnd called once', () => {
    jest.useFakeTimers();
    const visualizationRef = createVisualizationRef();
    const onCenterHoldAttempt = jest.fn((reportAccepted: (accepted: boolean) => void) => {
      reportAccepted(true);
    });
    const onCenterHoldEnd = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <InteractionBand
          visualizationRef={visualizationRef}
          onCenterHoldAttempt={onCenterHoldAttempt}
          onCenterHoldEnd={onCenterHoldEnd}
        />,
      );
    });
    const band = renderer!.root.findAllByType(View).find((n) => n.props.onLayout != null);
    act(() => band!.props.onLayout(layoutEvent));

    const gesture = lastGesture!;
    const stateManager = { activate: jest.fn(), fail: jest.fn() };
    act(() => gesture.handlers.onTouchesDown?.(downEvent, stateManager));
    act(() => jest.advanceTimersByTime(450));
    expect(onCenterHoldAttempt).toHaveBeenCalledTimes(1);
    const reportAccepted = onCenterHoldAttempt.mock.calls[0][0];
    act(() => reportAccepted(true));

    act(() => gesture.handlers.onTouchesUp?.(upEvent));
    expect(onCenterHoldEnd).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('late reportAccepted from touch A cannot bless touch B', () => {
    jest.useFakeTimers();
    const visualizationRef = createVisualizationRef();
    const capturedReportAccepted: Array<(accepted: boolean) => void> = [];
    const onCenterHoldAttempt = jest.fn((reportAccepted: (accepted: boolean) => void) => {
      capturedReportAccepted.push(reportAccepted);
    });
    const onCenterHoldEnd = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <InteractionBand
          visualizationRef={visualizationRef}
          onCenterHoldAttempt={onCenterHoldAttempt}
          onCenterHoldEnd={onCenterHoldEnd}
          centerHoldShouldBypassDelay
        />,
      );
    });
    const band = renderer!.root.findAllByType(View).find((n) => n.props.onLayout != null);
    act(() => band!.props.onLayout(layoutEvent));

    const gesture = lastGesture!;
    const stateManager = { activate: jest.fn(), fail: jest.fn() };
    act(() => gesture.handlers.onTouchesDown?.(downEvent, stateManager));
    expect(onCenterHoldAttempt).toHaveBeenCalledTimes(1);
    expect(capturedReportAccepted).toHaveLength(1);

    act(() => gesture.handlers.onTouchesUp?.(upEvent));
    expect(onCenterHoldEnd).not.toHaveBeenCalled();

    act(() => gesture.handlers.onTouchesDown?.(downEvent, stateManager));
    expect(onCenterHoldAttempt).toHaveBeenCalledTimes(2);
    expect(capturedReportAccepted).toHaveLength(2);

    act(() => capturedReportAccepted[0](true));
    act(() => gesture.handlers.onTouchesUp?.(upEvent));
    expect(onCenterHoldEnd).not.toHaveBeenCalled();

    act(() => gesture.handlers.onTouchesDown?.(downEvent, stateManager));
    expect(onCenterHoldAttempt).toHaveBeenCalledTimes(3);
    expect(capturedReportAccepted).toHaveLength(3);

    act(() => capturedReportAccepted[2](true));
    act(() => gesture.handlers.onTouchesUp?.(upEvent));
    expect(onCenterHoldEnd).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
