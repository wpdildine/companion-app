import type { CapturedSttAudio } from '../../hooks/useSttAudioCapture';
import type { AudioSessionState } from './sessionCoordinator';

export type AvFactKind =
  | 'av.start.route_selected'
  | 'av.session.transitioned'
  | 'av.session.blocked'
  | 'av.session.grace_scheduled'
  | 'av.session.grace_elapsed'
  | 'av.playback.started'
  | 'av.playback.completed'
  | 'av.playback.cancelled'
  | 'av.playback.failed'
  | 'av.capture.failed'
  | 'av.stt.timeout'
  | 'av.stt.unavailable'
  | 'av.stt.completed'
  | 'av.bookkeeping.next_listen_local_preference_cleared'
  | 'av.bookkeeping.listen_path'
  | 'av.bookkeeping.recording_session_id'
  | 'av.bookkeeping.speech_ended'
  | 'av.bookkeeping.io_block_cleared'
  | 'av.bookkeeping.listen_in_signal'
  | 'av.bookkeeping.pending_captured_audio_set'
  | 'av.bookkeeping.remote_stt_empty_flag';

export type AvBaseFact = {
  kind: AvFactKind;
  at: number;
  recordingSessionId?: string;
  /** On `av.playback.*`, non-null when playback is bound to auto-play after a request; null for manual replay. */
  requestId?: number | null;
  provider?: string;
  code?: string;
  mechanicalReason?: string;
  details?: {
    waitMs?: number;
    graceMs?: number;
    timeoutMs?: number;
    durationMillis?: number;
    sizeBase64Chars?: number;
    startLatencyMs?: number;
    /** Playback failure message (observational; `av.playback.failed` only). */
    message?: string;
  };
};

export type AvSessionTransitionFact = AvBaseFact & {
  kind: 'av.session.transitioned';
  next: AudioSessionState;
};

export type AvFact =
  | AvSessionTransitionFact
  | (AvBaseFact & { kind: 'av.start.route_selected'; route: string })
  | (AvBaseFact & {
      kind:
        | 'av.playback.started'
        | 'av.playback.completed'
        | 'av.playback.cancelled'
        | 'av.playback.failed';
    })
  | (AvBaseFact & {
      kind: 'av.capture.failed';
      failureKind: string;
      message: string;
    })
  | (AvBaseFact & { kind: 'av.stt.timeout' })
  | (AvBaseFact & { kind: 'av.stt.unavailable'; emptyTranscript: boolean })
  | (AvBaseFact & { kind: 'av.stt.completed' })
  | (AvBaseFact & { kind: 'av.bookkeeping.next_listen_local_preference_cleared' })
  | (AvBaseFact & {
      kind: 'av.bookkeeping.listen_path';
      listenPath: 'local' | 'remote';
    })
  | (AvBaseFact & {
      kind: 'av.bookkeeping.recording_session_id';
      sessionId: string;
    })
  | (AvBaseFact & {
      kind: 'av.bookkeeping.speech_ended';
      value: boolean;
    })
  | (AvBaseFact & { kind: 'av.bookkeeping.io_block_cleared' })
  | (AvBaseFact & { kind: 'av.bookkeeping.listen_in_signal' })
  | (AvBaseFact & {
      kind: 'av.bookkeeping.pending_captured_audio_set';
      capture: CapturedSttAudio | null;
    })
  | (AvBaseFact & {
      kind: 'av.bookkeeping.remote_stt_empty_flag';
      value: boolean;
    });

export type AvFactEmitter = (fact: AvFact) => void;
