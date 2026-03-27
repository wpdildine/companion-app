import type { SttProvider } from '../../../shared/config/endpointConfig';
import type { LogDetails, LogScope } from '../../../shared/logging';
import type {
  CapturedSttAudio,
  SttAudioCaptureFailureKind,
} from '../../hooks/useSttAudioCapture';
import { type AudioSessionState, IOS_STOP_GRACE_MS } from './sessionCoordinator';

type AvLog = (
  scope: LogScope,
  message: string,
  details?: LogDetails
) => void;

export type AvStartRoute =
  | 'local_voice_default'
  | 'remote_capture_required'
  | 'local_voice_next_listen_preference'
  | 'local_voice_remote_unavailable';

export type AvPlaybackRoute = 'piper' | 'react-native-tts';
type AvPlaybackFactEvent = 'started' | 'completed' | 'cancelled';

export type AvPlaybackFact = {
  event: AvPlaybackFactEvent;
  provider: AvPlaybackRoute;
  requestId: number | null;
  at: number;
};

export type RemoteStopFinalizeFact =
  | {
      kind: 'capture_failed';
      recordingSessionId?: string;
      failureKind: SttAudioCaptureFailureKind;
      message: string;
    }
  | {
      kind: 'stt_timeout';
      recordingSessionId?: string;
    }
  | {
      kind: 'stt_unavailable';
      recordingSessionId?: string;
      emptyTranscript: boolean;
    }
  | {
      kind: 'transcript_ready';
      recordingSessionId?: string;
    };

export function selectAvStartRouteMechanics(opts: {
  sttProvider: SttProvider;
  hasVoiceModule: boolean;
  endpointAvailable: boolean;
  nextListenLocalPreference: boolean;
}): { route: AvStartRoute; fallbackReason?: string } {
  const {
    sttProvider,
    hasVoiceModule,
    endpointAvailable,
    nextListenLocalPreference,
  } = opts;
  if (sttProvider === 'local') {
    return { route: 'local_voice_default' };
  }
  if (sttProvider === 'remote') {
    return { route: 'remote_capture_required' };
  }
  if (nextListenLocalPreference) {
    return { route: 'local_voice_next_listen_preference' };
  }
  if (!endpointAvailable && hasVoiceModule) {
    return {
      route: 'local_voice_remote_unavailable',
      fallbackReason: 'remote_start_unavailable_missing_url',
    };
  }
  return { route: 'remote_capture_required' };
}

export async function startAvLocalVoiceListeningMechanics(args: {
  recordingSessionId: string;
  sttProvider: SttProvider;
  opts?: {
    clearedNextListenPreference?: boolean;
    startTimeFallbackReason?: string;
  };
  startVoice: () => Promise<void>;
  onClearNextListenPreference: () => void;
  setListenPath: (next: 'local' | 'remote') => void;
  setAudioState: (next: AudioSessionState, context?: object) => void;
  clearIoBlock: () => void;
  setRecordingSession: (sessionId: string) => void;
  setSpeechEnded: (v: boolean) => void;
  getSttProviderForLog: () => SttProvider;
  getSessionSttOverrideApplied: () => boolean;
  getRecordingStartAt: () => number | null;
  playListenIn: () => void;
  logInfo: AvLog;
}): Promise<void> {
  const {
    recordingSessionId,
    sttProvider,
    opts,
    startVoice,
    onClearNextListenPreference,
    setListenPath,
    setAudioState,
    clearIoBlock,
    setRecordingSession,
    setSpeechEnded,
    getSttProviderForLog,
    getSessionSttOverrideApplied,
    getRecordingStartAt,
    playListenIn,
    logInfo,
  } = args;

  if (opts?.clearedNextListenPreference) {
    onClearNextListenPreference();
    logInfo(
      'AgentOrchestrator',
      'stt next-listen local preference cleared after local start',
      { recordingSessionId }
    );
  }
  if (opts?.startTimeFallbackReason) {
    logInfo('AgentOrchestrator', 'stt start-time fallback to local', {
      recordingSessionId,
      stt_preferred_mode: sttProvider,
      stt_override_applied: getSessionSttOverrideApplied(),
      stt_env_mode: getSttProviderForLog(),
      stt_start_time_fallback_applied: true,
      stt_mechanism_reason_class: opts.startTimeFallbackReason,
    });
  }
  await startVoice();
  setListenPath('local');
  setAudioState('listening', { recordingSessionId });
  clearIoBlock();
  setRecordingSession(recordingSessionId);
  setSpeechEnded(false);
  const recordingStartAt = getRecordingStartAt();
  logInfo('AgentOrchestrator', 'voice listen active', {
    recordingSessionId,
    stt_preferred_mode: sttProvider,
    stt_override_applied: getSessionSttOverrideApplied(),
    stt_env_mode: getSttProviderForLog(),
    stt_effective_listen_mode: 'local',
    startLatencyMs:
      recordingStartAt != null ? Date.now() - recordingStartAt : undefined,
  });
  logInfo('AgentOrchestrator', 'start attempt accepted', {
    recordingSessionId,
  });
  playListenIn();
}

export async function startAvRemoteCaptureListeningMechanics(args: {
  recordingSessionId: string;
  sttProvider: SttProvider;
  beginCapture: (recordingSessionId?: string) => Promise<boolean>;
  setListenPath: (next: 'local' | 'remote') => void;
  setAudioState: (next: AudioSessionState, context?: object) => void;
  clearIoBlock: () => void;
  setRecordingSession: (sessionId: string) => void;
  setSpeechEnded: (v: boolean) => void;
  getSttProviderForLog: () => SttProvider;
  getSessionSttOverrideApplied: () => boolean;
  getRecordingStartAt: () => number | null;
  playListenIn: () => void;
  logInfo: AvLog;
}): Promise<boolean> {
  const {
    recordingSessionId,
    sttProvider,
    beginCapture,
    setListenPath,
    setAudioState,
    clearIoBlock,
    setRecordingSession,
    setSpeechEnded,
    getSttProviderForLog,
    getSessionSttOverrideApplied,
    getRecordingStartAt,
    playListenIn,
    logInfo,
  } = args;
  const captureStarted = await beginCapture(recordingSessionId);
  if (!captureStarted) {
    return false;
  }
  setListenPath('remote');
  setAudioState('listening', { recordingSessionId });
  clearIoBlock();
  setRecordingSession(recordingSessionId);
  setSpeechEnded(false);
  const recordingStartAt = getRecordingStartAt();
  logInfo('AgentOrchestrator', 'voice listen active', {
    recordingSessionId,
    stt_preferred_mode: sttProvider,
    stt_override_applied: getSessionSttOverrideApplied(),
    stt_env_mode: getSttProviderForLog(),
    stt_effective_listen_mode: 'remote',
    startLatencyMs:
      recordingStartAt != null ? Date.now() - recordingStartAt : undefined,
  });
  logInfo('AgentOrchestrator', 'start attempt accepted', {
    recordingSessionId,
  });
  playListenIn();
  return true;
}

export function selectAvPlaybackRouteMechanics(
  canUsePiper: boolean
): AvPlaybackRoute {
  return canUsePiper ? 'piper' : 'react-native-tts';
}

export function startAvPlaybackLifecycleMechanics(args: {
  provider: AvPlaybackRoute;
  playbackRequestId: number | null;
  activePlaybackProviderRef: { current: AvPlaybackRoute | null };
  isPlaybackHandoffLogEnabled: boolean;
  logInfo: AvLog;
}): AvPlaybackFact {
  const {
    provider,
    playbackRequestId,
    activePlaybackProviderRef,
    isPlaybackHandoffLogEnabled,
    logInfo,
  } = args;
  activePlaybackProviderRef.current = provider;
  const ttsStartedAt = Date.now();
  if (isPlaybackHandoffLogEnabled) {
    logInfo('AgentOrchestrator', 'playback started', { provider });
  }
  return {
    event: 'started',
    provider,
    requestId: playbackRequestId,
    at: ttsStartedAt,
  };
}

export function finishAvPlaybackLifecycleMechanics(args: {
  endedAt: number;
  playbackRequestId: number | null;
  activePlaybackProviderRef: { current: AvPlaybackRoute | null };
  event?: 'completed' | 'cancelled';
}): AvPlaybackFact {
  const {
    endedAt,
    playbackRequestId,
    activePlaybackProviderRef,
    event = 'completed',
  } = args;
  const provider = activePlaybackProviderRef.current ?? 'react-native-tts';
  activePlaybackProviderRef.current = null;
  return {
    event,
    provider,
    requestId: playbackRequestId,
    at: endedAt,
  };
}

export async function runRemoteStopFinalizeMechanics(args: {
  recordingSessionId?: string;
  endCapture: (
    recordingSessionId?: string
  ) => Promise<
    | { ok: true; capture: CapturedSttAudio }
    | {
        ok: false;
        failureKind: SttAudioCaptureFailureKind;
        message: string;
      }
  >;
  transcribeCapturedAudioIfNeeded: (recordingSessionId?: string) => Promise<boolean>;
  setPendingCapturedAudio: (capture: CapturedSttAudio | null) => void;
  setAudioState: (next: AudioSessionState, context?: object) => void;
  setLastRemoteSttEmpty: (v: boolean) => void;
  getLastRemoteSttEmpty: () => boolean;
  settleTimeoutMs: number;
}): Promise<RemoteStopFinalizeFact> {
  const {
    recordingSessionId,
    endCapture,
    transcribeCapturedAudioIfNeeded,
    setPendingCapturedAudio,
    setAudioState,
    setLastRemoteSttEmpty,
    getLastRemoteSttEmpty,
    settleTimeoutMs,
  } = args;
  const captureResult = await endCapture(recordingSessionId);
  if (!captureResult.ok) {
    return {
      kind: 'capture_failed',
      recordingSessionId,
      failureKind: captureResult.failureKind,
      message: captureResult.message,
    };
  }
  setPendingCapturedAudio(captureResult.capture);
  setAudioState('settling', {
    recordingSessionId,
    reason: 'remoteCaptureComplete',
  });
  setLastRemoteSttEmpty(false);
  const sttPromise = transcribeCapturedAudioIfNeeded(recordingSessionId);
  const settleTimeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('ORCHESTRATOR_STT_SETTLE_TIMEOUT')),
      settleTimeoutMs
    )
  );
  try {
    const sttReady = await Promise.race([sttPromise, settleTimeoutPromise]);
    if (!sttReady) {
      const wasEmptyTranscript = getLastRemoteSttEmpty();
      setLastRemoteSttEmpty(false);
      return {
        kind: 'stt_unavailable',
        recordingSessionId,
        emptyTranscript: wasEmptyTranscript,
      };
    }
    return { kind: 'transcript_ready', recordingSessionId };
  } catch (e) {
    if (
      e instanceof Error &&
      e.message === 'ORCHESTRATOR_STT_SETTLE_TIMEOUT'
    ) {
      return { kind: 'stt_timeout', recordingSessionId };
    }
    throw e;
  }
}

export function runNativeStopWithLoggingMechanics(args: {
  recordingSessionId: string | undefined;
  runStop: () => Promise<void>;
  pendingSubmitWhenReady: boolean;
  platformIsIos: boolean;
  executeNativeStopWithGrace: (
    platformIsIos: boolean,
    recordingSessionId: string | undefined,
    graceMs: number,
    runStop: () => Promise<void>
  ) => Promise<void>;
  logInfo: AvLog;
}): Promise<void> {
  const {
    recordingSessionId,
    runStop,
    pendingSubmitWhenReady,
    platformIsIos,
    executeNativeStopWithGrace,
    logInfo,
  } = args;
  logInfo('AgentOrchestrator', 'native voice stop in flight', {
    recordingSessionId,
  });
  logInfo('AgentOrchestrator', 'voice stop invoked', {
    recordingSessionId,
    platform: platformIsIos ? 'ios' : 'non-ios',
    pendingSubmitWhenReady,
  });
  if (platformIsIos) {
    logInfo('AgentOrchestrator', 'ios stop grace scheduled', {
      recordingSessionId,
      graceMs: IOS_STOP_GRACE_MS,
    });
  } else {
    logInfo('AgentOrchestrator', 'voice stop invoked immediately (non-ios)', {
      recordingSessionId,
    });
  }
  return executeNativeStopWithGrace(
    platformIsIos,
    recordingSessionId,
    IOS_STOP_GRACE_MS,
    runStop
  );
}

export async function cleanupPendingIosStopIfNeededMechanics(args: {
  recordingSessionId?: string;
  nextAudioState?: 'idleReady' | 'settling';
  platformIsIos: boolean;
  getIosStopPending: () => boolean;
  getIosStopInvoked: () => boolean;
  setAudioState: (next: AudioSessionState, context?: object) => void;
  invokeStop: () => Promise<void>;
  setIosStopPending: (v: boolean) => void;
  setIosStopInvoked: (v: boolean) => void;
  logInfo: AvLog;
}): Promise<void> {
  const {
    recordingSessionId,
    nextAudioState = 'idleReady',
    platformIsIos,
    getIosStopPending,
    getIosStopInvoked,
    setAudioState,
    invokeStop,
    setIosStopPending,
    setIosStopInvoked,
    logInfo,
  } = args;
  if (!platformIsIos || !getIosStopPending() || getIosStopInvoked()) {
    return;
  }
  logInfo('AgentOrchestrator', 'cleanup forcing native voice stop before idle', {
    recordingSessionId,
  });
  setAudioState('stopping', { recordingSessionId });
  logInfo('AgentOrchestrator', 'native voice stop in flight', {
    recordingSessionId,
  });
  await invokeStop();
  setIosStopPending(false);
  setIosStopInvoked(true);
  setAudioState(nextAudioState, {
    recordingSessionId,
    reason: 'nativeStopComplete',
  });
  logInfo('AgentOrchestrator', 'native voice stop completed', {
    recordingSessionId,
  });
}
