/**
 * Unit tests for session coordinator: shouldBlockStart, setAudioState, iOS stop grace.
 */

import {
  createSessionCoordinator,
  IOS_STOP_GRACE_MS,
} from './sessionCoordinator';

describe('createSessionCoordinator', () => {
  const onAudioStateChange = jest.fn();
  let coordinator: ReturnType<typeof createSessionCoordinator>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    coordinator = createSessionCoordinator({ onAudioStateChange });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shouldBlockStart returns block: false when idleReady and no guard', () => {
    expect(coordinator.shouldBlockStart()).toEqual({ block: false });
  });

  it('shouldBlockStart returns block: true when not idleReady', () => {
    coordinator.setAudioState('listening');
    expect(coordinator.shouldBlockStart()).toEqual({ block: true, reason: 'audioNotReady' });
  });

  it('setAudioState updates state and calls onAudioStateChange', () => {
    coordinator.setAudioState('starting', { reason: 'test' });
    expect(coordinator.getAudioState()).toBe('starting');
    expect(onAudioStateChange).toHaveBeenCalledWith('idleReady', 'starting', { reason: 'test' });
  });

  it('scheduleIosStopGrace calls onElapsed after delay', () => {
    const onElapsed = jest.fn();
    coordinator.scheduleIosStopGrace('rec-1', IOS_STOP_GRACE_MS, onElapsed);
    expect(coordinator.getIosStopPending()).toBe(true);
    jest.advanceTimersByTime(IOS_STOP_GRACE_MS);
    expect(onElapsed).toHaveBeenCalled();
    expect(coordinator.getIosStopPending()).toBe(false);
  });

  it('clearIosStopGraceTimer cancels scheduled grace', () => {
    const onElapsed = jest.fn();
    coordinator.scheduleIosStopGrace('rec-1', IOS_STOP_GRACE_MS, onElapsed);
    coordinator.clearIosStopGraceTimer();
    jest.advanceTimersByTime(IOS_STOP_GRACE_MS);
    expect(onElapsed).not.toHaveBeenCalled();
  });
});
