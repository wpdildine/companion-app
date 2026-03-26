/**
 * Transcript settlement: quiet window, flush boundary, final vs partial candidate.
 * Owns settlement timers and refs; does not own lifecycle/mode. Orchestrator commits via callbacks.
 */

import { Platform } from 'react-native';
import { logInfo, logWarn } from '../../../shared/logging';

const LOG_TAG = 'AgentOrchestrator';

/** Short window after speechEnd to wait for final transcript before settling on partial. */
export const POST_SPEECH_END_QUIET_WINDOW_MS = 200;
/** Short window after first final to allow a better final before settlement. */
export const POST_FINAL_STABILIZATION_WINDOW_MS = 120;
/** Bounded post-stop flush window: settlement allowed after this from stop-request anchor if speechEnd has not arrived. */
export const POST_STOP_FLUSH_WINDOW_MS = 400;
export const ANDROID_TAIL_GRACE_MS = 200;

export function normalizeTranscript(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function transcriptPreview(text: string): string {
  const normalized = normalizeTranscript(text);
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 117)}...`;
}

export function transcriptTrace(text: string): { chars: number; text: string; preview: string } {
  const normalized = normalizeTranscript(text);
  return {
    chars: normalized.length,
    text: normalized,
    preview: transcriptPreview(normalized),
  };
}

/** Do not apply a settlement choice shorter than the orchestrator's committed line (e.g. late final already promoted). */
function clampChoiceToCommittedFloor(
  chosen: string,
  getTranscribedText: () => string,
): string {
  const committedNorm = normalizeTranscript(getTranscribedText());
  const chosenNorm = normalizeTranscript(chosen);
  if (committedNorm.length === 0) return chosen;
  if (chosenNorm.length >= committedNorm.length) return chosen;
  return getTranscribedText();
}

export type AudioSessionState = 'idleReady' | 'starting' | 'listening' | 'stopping' | 'settling';

export type SettlementOutcome =
  | {
      kind: 'ready';
      shouldSubmit: boolean;
    }
  | {
      kind: 'ignored';
    }
  | {
      kind: 'recoverable_empty';
      shouldSubmit: boolean;
      failureReason: 'noUsableTranscript';
    }
  | {
      kind: 'stt_failed';
      shouldSubmit: true;
    };

/** Dependencies: orchestrator provides getters and callbacks; settlement never touches lifecycle/mode directly. */
export interface TranscriptSettlementDeps {
  getPartialTranscript: () => string;
  getTranscribedText: () => string;
  updateTranscript: (text: string) => void;
  getSpeechEnded: () => boolean;
  getRecordingSessionId: () => string | null;
  finalizeTranscriptFromPartial: (reason: string, recordingSessionId?: string) => void;
  emitRecoverableFailure: (reason: string, details?: Record<string, unknown>) => void;
  transcribeCapturedAudioIfNeeded: (recordingSessionId?: string) => Promise<boolean>;
}

export interface TranscriptSettlementCoordinator {
  resolveSettlement: (reason: string, recordingSessionId?: string) => Promise<SettlementOutcome>;
  finalizeStop: (reason: string, recordingSessionId?: string) => void;
  startQuietWindow: (
    recordingSessionId: string | undefined,
    onResolved: (outcome: SettlementOutcome) => void,
  ) => void;
  acceptFinalCandidate: (combinedText: string, sessionId: string | undefined) => void;
  setFlushBoundaryAnchor: () => void;
  getSettlementResolved: () => boolean;
  getPendingSubmitWhenReady: () => boolean;
  getPendingSubmitSessionId: () => string | null;
  getLastSettledSessionId: () => string | null;
  getFinalStabilizationActive: () => boolean;
  getFinalCandidateText: () => string | null;
  getFinalCandidateSessionId: () => string | null;
  setPendingSubmit: (sessionId: string | null) => void;
  clearFinalizeTimer: () => void;
  scheduleFlushWindow: (onFlush: () => void) => void;
  scheduleDelayedFinalize: (reason: string, recordingSessionId: string | undefined, delayMs: number) => void;
  /** Clear settlement timers and refs when starting a new listen session (no finalize side effects). */
  resetForNewSession: () => void;
}

export function createTranscriptSettlementCoordinator(
  deps: TranscriptSettlementDeps
): TranscriptSettlementCoordinator {
  const quietWindowTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
  const tailGraceTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
  const tailGraceSessionIdRef = { current: null as string | null };
  const finalStabilizationTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
  const finalStabilizationActiveRef = { current: false };
  const finalCandidateTextRef = { current: null as string | null };
  const finalCandidateSessionIdRef = { current: null as string | null };
  const flushBoundaryAnchorAtRef = { current: null as number | null };
  const settlementResolvedRef = { current: false };
  const lastSettledSessionIdRef = { current: null as string | null };
  const finalizeTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
  const finalizeInFlightRef = { current: false };
  const pendingSubmitWhenReadyRef = { current: false };
  const pendingSubmitSessionIdRef = { current: null as string | null };
  let flushWindowTimerId: ReturnType<typeof setTimeout> | null = null;

  function clearSettlementTimersOnly() {
    if (quietWindowTimerRef.current) {
      clearTimeout(quietWindowTimerRef.current);
      quietWindowTimerRef.current = null;
    }
    if (tailGraceTimerRef.current) {
      clearTimeout(tailGraceTimerRef.current);
      tailGraceTimerRef.current = null;
    }
    tailGraceSessionIdRef.current = null;
    if (finalStabilizationTimerRef.current) {
      clearTimeout(finalStabilizationTimerRef.current);
      finalStabilizationTimerRef.current = null;
    }
    if (flushWindowTimerId) {
      clearTimeout(flushWindowTimerId);
      flushWindowTimerId = null;
    }
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  }

  function clearAllSettlementTimers() {
    clearSettlementTimersOnly();
  }

  function resetSettlementRefs() {
    flushBoundaryAnchorAtRef.current = null;
    finalStabilizationActiveRef.current = false;
    finalCandidateTextRef.current = null;
    finalCandidateSessionIdRef.current = null;
    pendingSubmitWhenReadyRef.current = false;
    pendingSubmitSessionIdRef.current = null;
    settlementResolvedRef.current = false;
  }

  const finalizeStop = (reason: string, recordingSessionId?: string) => {
    if (finalizeInFlightRef.current) return;
    finalizeInFlightRef.current = true;
    clearAllSettlementTimers();
    resetSettlementRefs();
    deps.finalizeTranscriptFromPartial(reason, recordingSessionId);
    finalizeInFlightRef.current = false;
  };

  const resolveSettlement = async (reason: string, recordingSessionId?: string) => {
    if (settlementResolvedRef.current) return { kind: 'ignored' } satisfies SettlementOutcome;
    const capturedFinalCandidate = finalCandidateTextRef.current ?? '';
    const capturedPartialNorm = normalizeTranscript(deps.getPartialTranscript());
    if (
      reason === 'flushWindowExpired' &&
      Platform.OS === 'android' &&
      !deps.getSpeechEnded()
    ) {
      const bestByLength =
        capturedFinalCandidate.length >= capturedPartialNorm.length
          ? capturedFinalCandidate
          : capturedPartialNorm;
      const sessionKey = recordingSessionId ?? null;
      if (
        bestByLength &&
        !tailGraceTimerRef.current &&
        tailGraceSessionIdRef.current !== sessionKey
      ) {
        tailGraceSessionIdRef.current = sessionKey;
        return await new Promise<SettlementOutcome>(resolve => {
          tailGraceTimerRef.current = setTimeout(() => {
            tailGraceTimerRef.current = null;
            resolveSettlement('tailGraceExpired', recordingSessionId)
              .then(resolve)
              .catch(() => resolve({ kind: 'ignored' }));
          }, ANDROID_TAIL_GRACE_MS);
          logInfo(LOG_TAG, 'android tail grace scheduled before fallback commit', {
            recordingSessionId,
            graceMs: ANDROID_TAIL_GRACE_MS,
            candidateChars: bestByLength.length,
            candidateTranscriptText: bestByLength,
            candidateTranscriptPreview: transcriptPreview(bestByLength),
          });
        });
      }
    }
    settlementResolvedRef.current = true;
    const shouldSubmit = pendingSubmitWhenReadyRef.current;
    if (recordingSessionId) lastSettledSessionIdRef.current = recordingSessionId;
    clearAllSettlementTimers();
    resetSettlementRefs();

    if (reason === 'timeout' || reason === 'flushWindowExpired' || reason === 'tailGraceExpired') {
      const bestByLength =
        capturedFinalCandidate.length >= capturedPartialNorm.length
          ? capturedFinalCandidate
          : capturedPartialNorm;
      const clampedFlush = clampChoiceToCommittedFloor(
        bestByLength,
        deps.getTranscribedText,
      );
      logInfo(LOG_TAG, 'settlement candidate comparison', {
        recordingSessionId,
        reason,
        finalCandidateChars: capturedFinalCandidate.length,
        finalCandidateText: capturedFinalCandidate,
        finalCandidatePreview: transcriptPreview(capturedFinalCandidate),
        partialCandidateChars: capturedPartialNorm.length,
        partialCandidateText: capturedPartialNorm,
        partialCandidatePreview: transcriptPreview(capturedPartialNorm),
        chosenCandidateChars: bestByLength.length,
        chosenCandidateText: bestByLength,
        chosenCandidatePreview: transcriptPreview(bestByLength),
        clampedToCommittedFloor: clampedFlush !== bestByLength,
      });
      if (clampedFlush) {
        deps.updateTranscript(clampedFlush);
      } else {
        deps.finalizeTranscriptFromPartial(reason, recordingSessionId);
      }
      logInfo(LOG_TAG, 'flush-boundary settlement (flush window or timeout)', {
        recordingSessionId,
        hadFinal: !!capturedFinalCandidate,
        hadPartial: !!capturedPartialNorm,
      });
      const normalized = normalizeTranscript(deps.getTranscribedText());
      if (!normalized) {
        logInfo(LOG_TAG, 'flush produced empty transcript', {
          recordingSessionId,
          reason: 'timeout/flush empty',
        });
        logWarn(LOG_TAG, 'timeout settlement produced empty transcript', {
          recordingSessionId,
        });
        deps.emitRecoverableFailure('noUsableTranscript', { recordingSessionId, reason });
        return {
          kind: 'recoverable_empty',
          shouldSubmit,
          failureReason: 'noUsableTranscript',
        } satisfies SettlementOutcome;
      }
    } else if (reason === 'quietWindowExpired') {
      const bestByLength =
        capturedFinalCandidate.length >= capturedPartialNorm.length
          ? capturedFinalCandidate
          : capturedPartialNorm;
      logInfo(LOG_TAG, 'quiet window resolved at flush boundary', {
        recordingSessionId,
        hadFinal: !!capturedFinalCandidate,
        hadPartial: !!capturedPartialNorm,
      });
      const clampedQuiet = clampChoiceToCommittedFloor(
        bestByLength,
        deps.getTranscribedText,
      );
      logInfo(LOG_TAG, 'settlement candidate comparison', {
        recordingSessionId,
        reason,
        finalCandidateChars: capturedFinalCandidate.length,
        finalCandidateText: capturedFinalCandidate,
        finalCandidatePreview: transcriptPreview(capturedFinalCandidate),
        partialCandidateChars: capturedPartialNorm.length,
        partialCandidateText: capturedPartialNorm,
        partialCandidatePreview: transcriptPreview(capturedPartialNorm),
        chosenCandidateChars: bestByLength.length,
        chosenCandidateText: bestByLength,
        chosenCandidatePreview: transcriptPreview(bestByLength),
        clampedToCommittedFloor: clampedQuiet !== bestByLength,
      });
      if (clampedQuiet) {
        deps.updateTranscript(clampedQuiet);
      } else {
        deps.finalizeTranscriptFromPartial('quietWindowExpired', recordingSessionId);
      }
      const normalized = normalizeTranscript(deps.getTranscribedText());
      if (!normalized) {
        logInfo(LOG_TAG, 'quiet window produced empty transcript', {
          recordingSessionId,
          reason: 'quietWindow empty',
        });
        logWarn(LOG_TAG, 'quiet window produced empty transcript', {
          recordingSessionId,
        });
        deps.emitRecoverableFailure('noUsableTranscript', { recordingSessionId, reason: 'quietWindowExpired' });
        return {
          kind: 'recoverable_empty',
          shouldSubmit,
          failureReason: 'noUsableTranscript',
        } satisfies SettlementOutcome;
      }
    } else {
      logInfo(LOG_TAG, 'settlement at flush boundary', { reason, recordingSessionId });
    }

    if (shouldSubmit) {
      const sttReady = await deps.transcribeCapturedAudioIfNeeded(recordingSessionId);
      if (!sttReady) {
        return { kind: 'stt_failed', shouldSubmit: true } satisfies SettlementOutcome;
      }
    }
    logInfo(LOG_TAG, 'returning ready', {
      reason,
      recordingSessionId,
      shouldSubmit,
    });
    return { kind: 'ready', shouldSubmit } satisfies SettlementOutcome;
  };

  return {
    resolveSettlement,
    finalizeStop,
    startQuietWindow(recordingSessionId: string | undefined, onResolved: (outcome: SettlementOutcome) => void) {
      const sessionIdForQuiet = recordingSessionId;
      logInfo(LOG_TAG, 'speechEnd received, quiet window started', { recordingSessionId: sessionIdForQuiet });
      if (quietWindowTimerRef.current) {
        clearTimeout(quietWindowTimerRef.current);
        quietWindowTimerRef.current = null;
      }
      if (finalStabilizationTimerRef.current) {
        clearTimeout(finalStabilizationTimerRef.current);
        finalStabilizationTimerRef.current = null;
      }
      quietWindowTimerRef.current = setTimeout(() => {
        quietWindowTimerRef.current = null;
        if (settlementResolvedRef.current) return;
        if (deps.getRecordingSessionId() !== pendingSubmitSessionIdRef.current) return;
        const currentTranscript = normalizeTranscript(deps.getTranscribedText());
        const finalCandidate = finalCandidateTextRef.current ?? '';
        const partialCandidate = transcriptTrace(deps.getPartialTranscript());
        logInfo(LOG_TAG, 'quiet window settling current transcript', {
          recordingSessionId: sessionIdForQuiet,
          currentTranscriptChars: currentTranscript.length,
          currentTranscriptText: currentTranscript,
          currentTranscriptPreview: transcriptPreview(currentTranscript),
          finalCandidateChars: finalCandidate.length,
          finalCandidateTranscriptText: finalCandidate,
          finalCandidateTranscriptPreview: transcriptPreview(finalCandidate),
          partialCandidateChars: partialCandidate.chars,
          partialCandidateText: partialCandidate.text,
          partialCandidatePreview: partialCandidate.preview,
        });
        resolveSettlement('quietWindowExpired', sessionIdForQuiet)
          .then(onResolved)
          .catch(() => onResolved({ kind: 'ignored' }));
      }, POST_SPEECH_END_QUIET_WINDOW_MS);
    },
    acceptFinalCandidate(combinedText: string, sessionId: string | undefined) {
      const currentCandidate = finalCandidateTextRef.current ?? '';
      const normalizedIncoming = normalizeTranscript(combinedText);
      const normalizedCurrent = normalizeTranscript(currentCandidate);
      const normalizedCommitted = normalizeTranscript(deps.getTranscribedText());
      const shouldReplaceCandidate =
        normalizedIncoming.length >= normalizedCurrent.length &&
        normalizedIncoming.length >= normalizedCommitted.length;
      if (shouldReplaceCandidate) {
        finalCandidateTextRef.current = combinedText;
        finalCandidateSessionIdRef.current = sessionId ?? null;
      }
      finalStabilizationActiveRef.current = true;
      if (quietWindowTimerRef.current) {
        clearTimeout(quietWindowTimerRef.current);
        quietWindowTimerRef.current = null;
      }
      if (!finalStabilizationTimerRef.current) {
        finalStabilizationTimerRef.current = setTimeout(() => {
          finalStabilizationTimerRef.current = null;
          finalStabilizationActiveRef.current = false;
          if (settlementResolvedRef.current) return;
        }, POST_FINAL_STABILIZATION_WINDOW_MS);
      }
    },
    setFlushBoundaryAnchor() {
      flushBoundaryAnchorAtRef.current = Date.now();
    },
    getSettlementResolved: () => settlementResolvedRef.current,
    getPendingSubmitWhenReady: () => pendingSubmitWhenReadyRef.current,
    getPendingSubmitSessionId: () => pendingSubmitSessionIdRef.current,
    getLastSettledSessionId: () => lastSettledSessionIdRef.current,
    getFinalStabilizationActive: () => finalStabilizationActiveRef.current,
    getFinalCandidateText: () => finalCandidateTextRef.current,
    getFinalCandidateSessionId: () => finalCandidateSessionIdRef.current,
    setPendingSubmit(sessionId: string | null) {
      pendingSubmitWhenReadyRef.current = true;
      pendingSubmitSessionIdRef.current = sessionId;
      settlementResolvedRef.current = false;
      finalCandidateTextRef.current = null;
      finalCandidateSessionIdRef.current = null;
      finalStabilizationActiveRef.current = false;
      flushBoundaryAnchorAtRef.current = Date.now();
      if (finalizeTimerRef.current) {
        clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
      if (finalStabilizationTimerRef.current) {
        clearTimeout(finalStabilizationTimerRef.current);
        finalStabilizationTimerRef.current = null;
      }
    },
    clearFinalizeTimer() {
      if (finalizeTimerRef.current) {
        clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
    },
    scheduleFlushWindow(onFlush: () => void) {
      if (flushWindowTimerId) clearTimeout(flushWindowTimerId);
      flushWindowTimerId = setTimeout(() => {
        flushWindowTimerId = null;
        onFlush();
      }, POST_STOP_FLUSH_WINDOW_MS);
    },
    scheduleDelayedFinalize(reason: string, recordingSessionId: string | undefined, delayMs: number) {
      if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = setTimeout(() => {
        finalizeTimerRef.current = null;
        finalizeStop(reason, recordingSessionId);
      }, delayMs);
    },
    resetForNewSession() {
      clearSettlementTimersOnly();
      resetSettlementRefs();
    },
  };
}
