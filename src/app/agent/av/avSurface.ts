import type { SttProvider } from '../../../shared/config/endpointConfig';
import type { LogDetails, LogScope } from '../../../shared/logging';
import type {
  CapturedSttAudio,
  SttAudioCaptureFailureKind,
} from '../../hooks/useSttAudioCapture';
import { type AudioSessionState, IOS_STOP_GRACE_MS } from './sessionCoordinator';
import type { AvFact, AvFactEmitter } from './avFacts';

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

export type AvPlaybackFact = {
  kind: 'av.playback.started' | 'av.playback.completed' | 'av.playback.cancelled';
  provider: AvPlaybackRoute;
  requestId: number | null;
  at: number;
};

export type RemoteStopFinalizeFact = Extract<
  AvFact,
  | { kind: 'av.capture.failed' }
  | { kind: 'av.stt.timeout' }
  | { kind: 'av.stt.unavailable' }
  | { kind: 'av.stt.completed' }
>;

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
  emitAvFact?: AvFactEmitter;
  getSttProviderForLog: () => SttProvider;
  getSessionSttOverrideApplied: () => boolean;
  getRecordingStartAt: () => number | null;
  logInfo: AvLog;
}): Promise<void> {
  const {
    recordingSessionId,
    sttProvider,
    opts,
    startVoice,
    emitAvFact,
    getSttProviderForLog,
    getSessionSttOverrideApplied,
    getRecordingStartAt,
    logInfo,
  } = args;
  const now = () => Date.now();

  if (opts?.clearedNextListenPreference) {
    emitAvFact?.({
      kind: 'av.bookkeeping.next_listen_local_preference_cleared',
      at: now(),
      recordingSessionId,
    });
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
  emitAvFact?.({
    kind: 'av.bookkeeping.listen_path',
    at: now(),
    recordingSessionId,
    listenPath: 'local',
  });
  emitAvFact?.({
    kind: 'av.session.transitioned',
    at: now(),
    recordingSessionId,
    next: 'listening',
    mechanicalReason: 'captureStartAccepted',
  });
  emitAvFact?.({ kind: 'av.bookkeeping.io_block_cleared', at: now(), recordingSessionId });
  emitAvFact?.({
    kind: 'av.bookkeeping.recording_session_id',
    at: now(),
    recordingSessionId,
    sessionId: recordingSessionId,
  });
  emitAvFact?.({
    kind: 'av.bookkeeping.speech_ended',
    at: now(),
    recordingSessionId,
    value: false,
  });
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
  emitAvFact?.({ kind: 'av.bookkeeping.listen_in_signal', at: now(), recordingSessionId });
}

export async function startAvRemoteCaptureListeningMechanics(args: {
  recordingSessionId: string;
  sttProvider: SttProvider;
  beginCapture: (recordingSessionId?: string) => Promise<boolean>;
  emitAvFact?: AvFactEmitter;
  getSttProviderForLog: () => SttProvider;
  getSessionSttOverrideApplied: () => boolean;
  getRecordingStartAt: () => number | null;
  logInfo: AvLog;
}): Promise<boolean> {
  const {
    recordingSessionId,
    sttProvider,
    beginCapture,
    emitAvFact,
    getSttProviderForLog,
    getSessionSttOverrideApplied,
    getRecordingStartAt,
    logInfo,
  } = args;
  const now = () => Date.now();
  const captureStarted = await beginCapture(recordingSessionId);
  if (!captureStarted) {
    return false;
  }
  emitAvFact?.({
    kind: 'av.bookkeeping.listen_path',
    at: now(),
    recordingSessionId,
    listenPath: 'remote',
  });
  emitAvFact?.({
    kind: 'av.session.transitioned',
    at: now(),
    recordingSessionId,
    next: 'listening',
    mechanicalReason: 'remoteCaptureStarted',
  });
  emitAvFact?.({ kind: 'av.bookkeeping.io_block_cleared', at: now(), recordingSessionId });
  emitAvFact?.({
    kind: 'av.bookkeeping.recording_session_id',
    at: now(),
    recordingSessionId,
    sessionId: recordingSessionId,
  });
  emitAvFact?.({
    kind: 'av.bookkeeping.speech_ended',
    at: now(),
    recordingSessionId,
    value: false,
  });
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
  emitAvFact?.({ kind: 'av.bookkeeping.listen_in_signal', at: now(), recordingSessionId });
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
    kind: 'av.playback.started',
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
    kind: event === 'cancelled' ? 'av.playback.cancelled' : 'av.playback.completed',
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
  emitAvFact?: AvFactEmitter;
  getLastRemoteSttEmpty: () => boolean;
  settleTimeoutMs: number;
}): Promise<RemoteStopFinalizeFact> {
  const {
    recordingSessionId,
    endCapture,
    transcribeCapturedAudioIfNeeded,
    emitAvFact,
    getLastRemoteSttEmpty,
    settleTimeoutMs,
  } = args;
  const at = () => Date.now();
  const captureResult = await endCapture(recordingSessionId);
  if (!captureResult.ok) {
    return {
      kind: 'av.capture.failed',
      at: at(),
      recordingSessionId,
      failureKind: captureResult.failureKind,
      message: captureResult.message,
    };
  }
  emitAvFact?.({
    kind: 'av.bookkeeping.pending_captured_audio_set',
    at: at(),
    recordingSessionId,
    capture: captureResult.capture,
  });
  emitAvFact?.({
    kind: 'av.session.transitioned',
    at: at(),
    recordingSessionId,
    next: 'settling',
    mechanicalReason: 'remoteCaptureComplete',
  });
  emitAvFact?.({
    kind: 'av.bookkeeping.remote_stt_empty_flag',
    at: at(),
    recordingSessionId,
    value: false,
  });
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
      emitAvFact?.({
        kind: 'av.bookkeeping.remote_stt_empty_flag',
        at: at(),
        recordingSessionId,
        value: false,
      });
      return {
        kind: 'av.stt.unavailable',
        at: at(),
        recordingSessionId,
        emptyTranscript: wasEmptyTranscript,
      };
    }
    return { kind: 'av.stt.completed', at: at(), recordingSessionId };
  } catch (e) {
    if (
      e instanceof Error &&
      e.message === 'ORCHESTRATOR_STT_SETTLE_TIMEOUT'
    ) {
      return { kind: 'av.stt.timeout', at: at(), recordingSessionId };
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
  emitAvFact?: AvFactEmitter;
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
    emitAvFact,
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
  emitAvFact?.({
    kind: 'av.session.transitioned',
    at: Date.now(),
    recordingSessionId,
    next: 'stopping',
    mechanicalReason: 'cleanupForcedStop',
  });
  logInfo('AgentOrchestrator', 'native voice stop in flight', {
    recordingSessionId,
  });
  await invokeStop();
  setIosStopPending(false);
  setIosStopInvoked(true);
  emitAvFact?.({
    kind: 'av.session.transitioned',
    at: Date.now(),
    recordingSessionId,
    next: nextAudioState,
    mechanicalReason: 'nativeStopComplete',
  });
  logInfo('AgentOrchestrator', 'native voice stop completed', {
    recordingSessionId,
  });
}
