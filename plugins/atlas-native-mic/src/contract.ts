/**
 * JS-visible contract for NATIVE_MIC (see docs/NATIVE_MIC_CONTRACT.md appendix).
 * Event type strings MUST match native iOS/Android exactly.
 */

export const MIC_EVENT_TYPES = {
  CAPTURE_STARTED: 'mic_capture_started',
  CAPTURE_STOPPING: 'mic_capture_stopping',
  CAPTURE_FINALIZED: 'mic_capture_finalized',
  INTERRUPTION: 'mic_interruption',
  FAILURE: 'mic_failure',
} as const;

export type MicEventType =
  (typeof MIC_EVENT_TYPES)[keyof typeof MIC_EVENT_TYPES];

/** Payload.data.phase values (session phase marker per contract). */
export type MicSessionPhase =
  | 'init'
  | 'capturing'
  | 'stopping'
  | 'finalized'
  | 'cancelled'
  | 'idle';

export interface MicEventPayload {
  type: MicEventType;
  message?: string;
  data?: {
    sessionId: string;
    phase: MicSessionPhase;
    stale?: boolean;
    code?: string;
    /** Failure classification axis (contract §6). */
    classification?: 'hardware_session' | 'transport' | 'interruption';
  };
}

export interface StopFinalizeResult {
  uri: string;
  durationMillis: number;
  /** True when stopFinalize was a duplicate after terminal (no new file). */
  duplicate?: boolean;
}
