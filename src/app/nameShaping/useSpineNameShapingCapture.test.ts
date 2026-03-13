/**
 * useSpineNameShapingCapture: touch-to-selector capture hook.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSpineNameShapingCapture } from './useSpineNameShapingCapture';
import type { NameShapingActions } from './useNameShapingState';

function createMockActions(): NameShapingActions & { calls: { setActiveSelector: unknown[]; appendEmittedToken: unknown[] } } {
  const calls = { setActiveSelector: [] as unknown[], appendEmittedToken: [] as unknown[] };
  return {
    calls,
    enable: () => {},
    disable: () => {},
    clear: () => {},
    appendEmittedToken: (token: unknown) => {
      calls.appendEmittedToken.push(token);
    },
    setActiveSelector: (selector: unknown) => {
      calls.setActiveSelector.push(selector);
    },
    commitBreak: () => {},
    setNormalizedSignature: () => {},
    setResolverCandidates: () => {},
    setSelectedCandidate: () => {},
  };
}

function Harness({
  enabled,
  actions,
  emitOnTouchStart = false,
}: {
  enabled: boolean;
  actions: NameShapingActions;
  emitOnTouchStart?: boolean;
}) {
  const { capture } = useSpineNameShapingCapture(enabled, actions, {
    emitOnTouchStart,
  });
  (globalThis as { __capture?: ReturnType<typeof useSpineNameShapingCapture>['capture'] }).__capture = capture;
  return null;
}

function getCapture() {
  return (globalThis as { __capture?: ReturnType<typeof useSpineNameShapingCapture>['capture'] }).__capture;
}

describe('useSpineNameShapingCapture', () => {
  it('when disabled, handlers are no-ops and do not call actions', () => {
    const actions = createMockActions();
    act(() => {
      TestRenderer.create(React.createElement(Harness, { enabled: false, actions }));
    });
    const capture = getCapture();
    expect(capture).toBeDefined();
    act(() => {
      capture!.onTouchStart([0, 0]);
      capture!.onTouchMove([0.5, 0]);
      capture!.onTouchEnd();
    });
    expect(actions.calls.setActiveSelector).toHaveLength(0);
    expect(actions.calls.appendEmittedToken).toHaveLength(0);
  });

  it('on touch end, calls setActiveSelector(null)', () => {
    const actions = createMockActions();
    act(() => {
      TestRenderer.create(React.createElement(Harness, { enabled: true, actions }));
    });
    const capture = getCapture();
    act(() => {
      capture!.onTouchStart([0, -0.25]);
    });
    expect(actions.calls.setActiveSelector).toContain('SOFT');
    act(() => {
      capture!.onTouchEnd();
    });
    expect(actions.calls.setActiveSelector).toContain(null);
  });

  it('on touch cancel, calls setActiveSelector(null)', () => {
    const actions = createMockActions();
    act(() => {
      TestRenderer.create(React.createElement(Harness, { enabled: true, actions }));
    });
    const capture = getCapture();
    act(() => {
      capture!.onTouchStart([0, 0.55]);
    });
    act(() => {
      capture!.onTouchCancel();
    });
    expect(actions.calls.setActiveSelector).toContain(null);
  });

  it('touch start in center voice lane does not emit selector capture', () => {
    const actions = createMockActions();
    act(() => {
      TestRenderer.create(React.createElement(Harness, { enabled: true, actions }));
    });
    const capture = getCapture();
    act(() => {
      capture!.onTouchStart([0, 0]);
    });
    expect(actions.calls.setActiveSelector).toContain(null);
    expect(actions.calls.appendEmittedToken).toHaveLength(0);
  });

  it('touch start in a selector lane sets activeSelector without emitting a token', () => {
    const actions = createMockActions();
    act(() => {
      TestRenderer.create(React.createElement(Harness, { enabled: true, actions }));
    });
    const capture = getCapture();
    act(() => {
      capture!.onTouchStart([0, 0.9]);
    });
    expect(actions.calls.setActiveSelector).toContain('BRIGHT');
    expect(actions.calls.appendEmittedToken).toHaveLength(0);
  });

  it('when emitOnTouchStart is enabled, touch start in a selector lane emits once', () => {
    const actions = createMockActions();
    act(() => {
      TestRenderer.create(
        React.createElement(Harness, {
          enabled: true,
          actions,
          emitOnTouchStart: true,
        }),
      );
    });
    const capture = getCapture();
    act(() => {
      capture!.onTouchStart([0, 0.9]);
    });
    expect(actions.calls.setActiveSelector).toContain('BRIGHT');
    expect(actions.calls.appendEmittedToken).toHaveLength(1);
    expect(actions.calls.appendEmittedToken[0]).toMatchObject({ selector: 'BRIGHT' });
  });

  it('moving within a selector region does not emit, crossing vertical regions emits once', () => {
    const actions = createMockActions();
    act(() => {
      TestRenderer.create(React.createElement(Harness, { enabled: true, actions }));
    });
    const capture = getCapture();
    act(() => {
      capture!.onTouchStart([0, 0.9]);
    });
    act(() => {
      capture!.onTouchMove([0, 0.82]);
    });
    expect(actions.calls.appendEmittedToken).toHaveLength(0);
    act(() => {
      capture!.onTouchMove([0, 0.55]);
    });
    expect(actions.calls.appendEmittedToken).toHaveLength(1);
    expect(actions.calls.appendEmittedToken[0]).toMatchObject({ selector: 'ROUND' });
    act(() => {
      capture!.onTouchMove([0, 0.5]);
    });
    expect(actions.calls.appendEmittedToken).toHaveLength(1);
  });

  it('when emitOnTouchStart is enabled, staying in the same region after touch start does not duplicate', () => {
    const actions = createMockActions();
    act(() => {
      TestRenderer.create(
        React.createElement(Harness, {
          enabled: true,
          actions,
          emitOnTouchStart: true,
        }),
      );
    });
    const capture = getCapture();
    act(() => {
      capture!.onTouchStart([0, 0.9]);
      capture!.onTouchMove([0, 0.82]);
    });
    expect(actions.calls.appendEmittedToken).toHaveLength(1);
    expect(actions.calls.appendEmittedToken[0]).toMatchObject({ selector: 'BRIGHT' });
  });

  it('moving through the center voice lane clears active selector without emitting', () => {
    const actions = createMockActions();
    act(() => {
      TestRenderer.create(React.createElement(Harness, { enabled: true, actions }));
    });
    const capture = getCapture();
    act(() => {
      capture!.onTouchStart([0, -0.25]);
      capture!.onTouchMove([0, 0]);
    });
    expect(actions.calls.setActiveSelector).toContain('SOFT');
    expect(actions.calls.setActiveSelector).toContain(null);
    expect(actions.calls.appendEmittedToken).toHaveLength(0);
  });
});
