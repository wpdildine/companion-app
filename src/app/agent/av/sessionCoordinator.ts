/**
 * Audio session coordinator: owns audio state ref, iOS stop grace, native restart guard.
 * Does not own finalizeStop or settlement; orchestrator wires those. Does not call native stop—orchestrator does.
 */

export const IOS_STOP_GRACE_MS = 250;

export type AudioSessionState =
  | 'idleReady'
  | 'starting'
  | 'listening'
  | 'stopping'
  | 'settling';

export interface SessionCoordinatorDeps {
  onAudioStateChange: (
    prev: AudioSessionState,
    next: AudioSessionState,
    context?: object,
  ) => void;
}

export interface SessionCoordinator {
  getAudioState: () => AudioSessionState;
  setAudioState: (next: AudioSessionState, context?: object) => void;
  shouldBlockStart: () => { block: boolean; reason?: string };
  clearIosStopGraceTimer: () => void;
  scheduleIosStopGrace: (
    recordingSessionId: string | undefined,
    delayMs: number,
    onElapsed: () => void,
  ) => void;
  getIosStopPending: () => boolean;
  getIosStopInvoked: () => boolean;
  setIosStopPending: (v: boolean) => void;
  setIosStopInvoked: (v: boolean) => void;
  setNativeRestartGuardUntil: (until: number) => void;
  getNativeRestartGuardUntil: () => number;
  /** Run native stop: on iOS schedule grace then runStop in callback; otherwise await runStop. Resolves when scheduled (iOS) or when runStop completes (non-iOS). */
  executeNativeStopWithGrace: (
    platformIsIos: boolean,
    recordingSessionId: string | undefined,
    graceMs: number,
    runStop: () => Promise<void>,
  ) => Promise<void>;
}

export function createSessionCoordinator(
  deps: SessionCoordinatorDeps,
): SessionCoordinator {
  const audioStateRef = { current: 'idleReady' as AudioSessionState };
  const nativeRestartGuardUntilRef = { current: 0 };
  const iosStopGraceTimerRef = {
    current: null as ReturnType<typeof setTimeout> | null,
  };
  const iosStopPendingRef = { current: false };
  const iosStopInvokedRef = { current: false };

  return {
    getAudioState: () => audioStateRef.current,
    setAudioState(next: AudioSessionState, context?: object) {
      const prev = audioStateRef.current;
      if (prev === next) return;
      audioStateRef.current = next;
      deps.onAudioStateChange(prev, next, context);
    },
    shouldBlockStart(): { block: boolean; reason?: string } {
      if (audioStateRef.current === 'starting')
        return { block: true, reason: 'audioStarting' };
      if (audioStateRef.current === 'stopping')
        return { block: true, reason: 'audioStopping' };
      if (audioStateRef.current === 'settling')
        return { block: true, reason: 'audioSettling' };
      if (iosStopPendingRef.current)
        return { block: true, reason: 'iosStopPending' };
      if (audioStateRef.current !== 'idleReady')
        return { block: true, reason: 'audioNotReady' };
      if (Date.now() < nativeRestartGuardUntilRef.current)
        return { block: true, reason: 'nativeGuard' };
      return { block: false };
    },
    clearIosStopGraceTimer() {
      if (iosStopGraceTimerRef.current) {
        clearTimeout(iosStopGraceTimerRef.current);
        iosStopGraceTimerRef.current = null;
      }
    },
    scheduleIosStopGrace(
      _recordingSessionId: string | undefined,
      delayMs: number,
      onElapsed: () => void,
    ) {
      iosStopPendingRef.current = true;
      if (iosStopGraceTimerRef.current) {
        clearTimeout(iosStopGraceTimerRef.current);
      }
      iosStopGraceTimerRef.current = setTimeout(() => {
        iosStopGraceTimerRef.current = null;
        iosStopPendingRef.current = false;
        onElapsed();
      }, delayMs);
    },
    getIosStopPending: () => iosStopPendingRef.current,
    getIosStopInvoked: () => iosStopInvokedRef.current,
    setIosStopPending: (v: boolean) => {
      iosStopPendingRef.current = v;
    },
    setIosStopInvoked: (v: boolean) => {
      iosStopInvokedRef.current = v;
    },
    setNativeRestartGuardUntil: (until: number) => {
      nativeRestartGuardUntilRef.current = until;
    },
    getNativeRestartGuardUntil: () => nativeRestartGuardUntilRef.current,
    async executeNativeStopWithGrace(
      platformIsIos: boolean,
      recordingSessionId: string | undefined,
      graceMs: number,
      runStop: () => Promise<void>,
    ): Promise<void> {
      if (platformIsIos) {
        this.scheduleIosStopGrace(recordingSessionId, graceMs, () =>
          runStop().catch(() => {}),
        );
        return;
      }
      await runStop();
    },
  };
}
