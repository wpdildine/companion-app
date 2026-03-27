import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import AtlasNativeMic from 'atlas-native-mic';
import { isNativeMicCaptureEnabled } from '../../shared/config/endpointConfig';
import { logInfo, logWarn } from '../../shared/logging';

/** Ensure EXPO_OS is set before expo-audio API calls (Android). */
function ensureExpoOsBeforeCapture(): void {
  if (typeof process !== 'undefined' && process.env && !process.env.EXPO_OS) {
    process.env.EXPO_OS = Platform.OS;
  }
}

export interface CapturedSttAudio {
  audioBase64: string;
  mimeType: string;
  filename: string;
  durationMillis: number;
  uri: string;
  debugPreservedUri?: string;
}

export type SttAudioCaptureFailureKind =
  | 'stopFailed'
  | 'missingFileAfterStop'
  | 'finalizeFailed';

export type SttAudioCaptureStopResult =
  | {
      ok: true;
      capture: CapturedSttAudio;
    }
  | {
      ok: false;
      failureKind: SttAudioCaptureFailureKind;
      message: string;
    };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function inferMimeType(uri: string): string {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.endsWith('.m4a') || lowerUri.endsWith('.mp4'))
    return 'audio/mp4';
  if (lowerUri.endsWith('.aac')) return 'audio/aac';
  if (lowerUri.endsWith('.wav')) return 'audio/wav';
  if (lowerUri.endsWith('.caf')) return 'audio/x-caf';
  if (lowerUri.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}

function canPreserveDebugCapture(): boolean {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
}

function buildPreservedFilename(
  sourceFilename: string,
  recordingSessionId?: string,
): string {
  const parts = sourceFilename.split('.');
  const ext = parts.length > 1 ? parts.pop() : undefined;
  const base = parts.join('.') || 'stt-capture';
  const suffix = `${recordingSessionId ?? 'capture'}-${Date.now()}`;
  return ext ? `${base}-${suffix}.${ext}` : `${base}-${suffix}`;
}

function preserveDebugCapture(
  audioBase64: string,
  sourceFilename: string,
  recordingSessionId?: string,
): string | undefined {
  if (!canPreserveDebugCapture()) return undefined;
  const documentUri =
    typeof Paths.document?.uri === 'string'
      ? Paths.document.uri.replace(/\/+$/, '')
      : null;
  try {
    if (!documentUri) {
      throw new Error('Document directory URI unavailable');
    }
    const debugDirUri = `${documentUri}/debug-stt-captures`;
    const preservedFileUri = `${debugDirUri}/${buildPreservedFilename(
      sourceFilename,
      recordingSessionId,
    )}`;
    const debugDir = new Directory(debugDirUri);
    debugDir.create({ idempotent: true, intermediates: true });
    const preservedFile = new File(preservedFileUri);
    preservedFile.create({ overwrite: true, intermediates: true });
    preservedFile.write(audioBase64, { encoding: 'base64' });
    return preservedFile.uri;
  } catch (error) {
    logWarn('AgentOrchestrator', 'stt audio capture preserve failed', {
      recordingSessionId,
      sourceFilename,
      documentUri,
      message: errorMessage(error),
    });
    return undefined;
  }
}

async function configureRecordingAudioMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    interruptionModeAndroid: 'duckOthers',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    allowsBackgroundRecording: false,
  });
}

async function restorePlaybackAudioMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    interruptionModeAndroid: 'duckOthers',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    allowsBackgroundRecording: false,
  });
}

function sessionKey(recordingSessionId?: string): string {
  return recordingSessionId?.trim() || 'capture';
}

type MicValidationTiming = {
  beginCaptureCalledAt?: number;
  nativeStartedAt?: number;
  endCaptureCalledAt?: number;
  nativeFinalizedAt?: number;
  cancelCalledAt?: number;
  cancelCompletedAt?: number;
};

function nowTs(): number {
  return Date.now();
}

function logMicValidation(
  event: string,
  payload: Record<string, unknown>,
  level: 'info' | 'warn' = 'info',
): void {
  const body = {
    timestamp: nowTs(),
    ...payload,
  };
  if (level === 'warn') {
    logWarn('AgentOrchestrator', `[MicValidation] ${event}`, body);
    return;
  }
  logInfo('AgentOrchestrator', `[MicValidation] ${event}`, body);
}

function shouldAttemptNativeMic(): boolean {
  return isNativeMicCaptureEnabled() && AtlasNativeMic.isAvailable();
}

function toFileUri(uri: string): string {
  if (uri.startsWith('file://')) return uri;
  if (uri.length === 0) return uri;
  return `file://${uri}`;
}

export function useSttAudioCapture() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isCapturing, setIsCapturing] = useState(false);
  const captureStartedAtRef = useRef<number | null>(null);
  const validationTimingBySessionRef = useRef<Record<string, MicValidationTiming>>(
    {},
  );
  const nativeMicActiveRef = useRef(false);
  const lastNativeCaptureRef = useRef<{
    sessionId: string;
    capture: CapturedSttAudio;
  } | null>(null);

  const beginCapture = useCallback(
    async (recordingSessionId?: string): Promise<boolean> => {
      ensureExpoOsBeforeCapture();
      const sid = sessionKey(recordingSessionId);
      const nativeMicEnabled = isNativeMicCaptureEnabled();
      validationTimingBySessionRef.current[sid] = {
        ...validationTimingBySessionRef.current[sid],
        beginCaptureCalledAt: nowTs(),
      };
      logMicValidation('beginCapture_called', {
        sessionId: sid,
        nativeMicEnabled,
      });
      try {
        let permissions: { granted: boolean; status?: string };
        try {
          const statusResult = await getRecordingPermissionsAsync();
          if (statusResult.granted) {
            permissions = { granted: true, status: statusResult.status };
          } else {
            permissions = await requestRecordingPermissionsAsync();
          }
        } catch {
          permissions = await requestRecordingPermissionsAsync();
        }
        if (!permissions.granted) {
          logWarn('AgentOrchestrator', 'stt audio capture permission denied', {
            recordingSessionId,
            status: permissions.status,
          });
          return false;
        }

        if (shouldAttemptNativeMic()) {
          logMicValidation('beginCapture_native_attempt', {
            sessionId: sid,
            nativeMicEnabled,
            selectedPath: 'native',
          });
          try {
            await AtlasNativeMic.init();
            await AtlasNativeMic.startCapture(sid);
            nativeMicActiveRef.current = true;
            lastNativeCaptureRef.current = null;
            captureStartedAtRef.current = Date.now();
            const t = nowTs();
            const prior = validationTimingBySessionRef.current[sid] ?? {};
            validationTimingBySessionRef.current[sid] = {
              ...prior,
              nativeStartedAt: t,
            };
            setIsCapturing(true);
            logMicValidation('beginCapture_native_started', {
              sessionId: sid,
              nativeMicEnabled,
              selectedPath: 'native',
              startLatencyMs:
                prior.beginCaptureCalledAt != null
                  ? Math.max(0, t - prior.beginCaptureCalledAt)
                  : undefined,
            });
            logInfo('AgentOrchestrator', 'stt audio capture started (native mic)', {
              recordingSessionId,
            });
            return true;
          } catch (e) {
            nativeMicActiveRef.current = false;
            logMicValidation(
              'beginCapture_native_failed',
              {
                sessionId: sid,
                nativeMicEnabled,
                selectedPath: 'native',
                message: errorMessage(e),
              },
              'warn',
            );
            logWarn(
              'AgentOrchestrator',
              'native mic capture start failed; falling back to expo-audio',
              {
                recordingSessionId,
                message: errorMessage(e),
              },
            );
            logMicValidation('beginCapture_expo_fallback', {
              sessionId: sid,
              nativeMicEnabled,
              selectedPath: 'expo',
              fallbackReason: 'native_start_failed',
            });
          }
        }

        await configureRecordingAudioMode();
        try {
          await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
        } catch (error) {
          const message = errorMessage(error);
          if (!message.toLowerCase().includes('already been prepared')) {
            throw error;
          }
        }
        recorder.record();
        nativeMicActiveRef.current = false;
        captureStartedAtRef.current = Date.now();
        setIsCapturing(true);
        logMicValidation('beginCapture_expo_started', {
          sessionId: sid,
          nativeMicEnabled,
          selectedPath: 'expo',
          startLatencyMs:
            validationTimingBySessionRef.current[sid]?.beginCaptureCalledAt != null
              ? Math.max(
                  0,
                  nowTs() -
                    (validationTimingBySessionRef.current[sid]
                      ?.beginCaptureCalledAt as number),
                )
              : undefined,
        });
        logInfo('AgentOrchestrator', 'stt audio capture started', { recordingSessionId });
        return true;
      } catch (error) {
        setIsCapturing(false);
        captureStartedAtRef.current = null;
        nativeMicActiveRef.current = false;
        logWarn('AgentOrchestrator', 'stt audio capture failed to start', {
          recordingSessionId,
          message: errorMessage(error),
        });
        try {
          await restorePlaybackAudioMode();
        } catch {
          /* ignore */
        }
        return false;
      }
    },
    [recorder],
  );

  const endCapture = useCallback(
    async (recordingSessionId?: string): Promise<SttAudioCaptureStopResult> => {
      const sid = sessionKey(recordingSessionId);
      validationTimingBySessionRef.current[sid] = {
        ...validationTimingBySessionRef.current[sid],
        endCaptureCalledAt: nowTs(),
      };
      logMicValidation('endCapture_called', {
        sessionId: sid,
        nativeMicEnabled: isNativeMicCaptureEnabled(),
        selectedPath: nativeMicActiveRef.current ? 'native' : 'expo',
      });

      if (nativeMicActiveRef.current) {
        let stopErrorMessage: string | null = null;
        try {
          const result = await AtlasNativeMic.stopFinalize(sid);
          nativeMicActiveRef.current = false;
          setIsCapturing(false);
          if (result.duplicate) {
            captureStartedAtRef.current = null;
            try {
              await restorePlaybackAudioMode();
            } catch {
              /* ignore */
            }
            const last = lastNativeCaptureRef.current;
            if (last != null && last.sessionId === sid) {
              logMicValidation('endCapture_native_duplicate_reused', {
                sessionId: sid,
                nativeMicEnabled: isNativeMicCaptureEnabled(),
                duplicate: true,
                selectedPath: 'native',
                finalizeLatencyMs:
                  validationTimingBySessionRef.current[sid]?.endCaptureCalledAt != null
                    ? Math.max(
                        0,
                        nowTs() -
                          (validationTimingBySessionRef.current[sid]
                            ?.endCaptureCalledAt as number),
                      )
                    : undefined,
              });
              logInfo(
                'AgentOrchestrator',
                'stt audio capture duplicate finalize treated as idempotent no-op (native mic)',
                { recordingSessionId },
              );
              return { ok: true, capture: last.capture };
            }
            logMicValidation(
              'endCapture_duplicate_missing_cached_capture',
              {
                sessionId: sid,
                nativeMicEnabled: isNativeMicCaptureEnabled(),
                duplicate: true,
                selectedPath: 'native',
                finalizeLatencyMs:
                  validationTimingBySessionRef.current[sid]?.endCaptureCalledAt != null
                    ? Math.max(
                        0,
                        nowTs() -
                          (validationTimingBySessionRef.current[sid]
                            ?.endCaptureCalledAt as number),
                      )
                    : undefined,
              },
              'warn',
            );
            return {
              ok: false,
              failureKind: 'missingFileAfterStop',
              message: 'duplicate stopFinalize without prior finalized capture (native mic)',
            };
          }
          const rawUri = result.uri;
          if (!rawUri) {
            captureStartedAtRef.current = null;
            try {
              await restorePlaybackAudioMode();
            } catch {
              /* ignore */
            }
            return {
              ok: false,
              failureKind: 'missingFileAfterStop',
              message: 'Native mic stop completed without capture URI',
            };
          }
          const uri = toFileUri(rawUri);
          const file = new File(uri);
          const audioBase64 = await file.base64();
          const filename = uri.split('/').pop() ?? `stt-${Date.now()}.m4a`;
          const durationMillis =
            result.durationMillis > 0
              ? result.durationMillis
              : captureStartedAtRef.current != null
                ? Math.max(0, Date.now() - captureStartedAtRef.current)
                : 0;
          const mimeType = inferMimeType(uri);
          const debugPreservedUri = preserveDebugCapture(
            audioBase64,
            filename,
            recordingSessionId,
          );
          const payload: CapturedSttAudio = {
            audioBase64,
            mimeType,
            filename,
            durationMillis,
            uri,
            ...(debugPreservedUri != null && { debugPreservedUri }),
          };
          lastNativeCaptureRef.current = { sessionId: sid, capture: payload };
          const finalizedAt = nowTs();
          validationTimingBySessionRef.current[sid] = {
            ...validationTimingBySessionRef.current[sid],
            nativeFinalizedAt: finalizedAt,
          };
          logMicValidation('endCapture_native_finalized', {
            sessionId: sid,
            nativeMicEnabled: isNativeMicCaptureEnabled(),
            selectedPath: 'native',
            duplicate: !!result.duplicate,
            filename,
            mimeType,
            sizeBase64Chars: audioBase64.length,
            finalizeLatencyMs:
              validationTimingBySessionRef.current[sid]?.endCaptureCalledAt != null
                ? Math.max(
                    0,
                    finalizedAt -
                      (validationTimingBySessionRef.current[sid]
                        ?.endCaptureCalledAt as number),
                  )
                : undefined,
          });
          logInfo('AgentOrchestrator', 'stt audio capture completed (native mic)', {
            recordingSessionId,
            durationMillis,
            filename,
            mimeType,
            sizeBase64Chars: audioBase64.length,
            debugPreservedUri: debugPreservedUri ?? null,
          });
          captureStartedAtRef.current = null;
          try {
            await restorePlaybackAudioMode();
          } catch {
            /* ignore */
          }
          return { ok: true, capture: payload };
        } catch (error) {
          stopErrorMessage = errorMessage(error);
          nativeMicActiveRef.current = false;
          setIsCapturing(false);
          captureStartedAtRef.current = null;
          logMicValidation(
            'endCapture_failed',
            {
              sessionId: sid,
              nativeMicEnabled: isNativeMicCaptureEnabled(),
              selectedPath: 'native',
              duplicate: false,
              message: stopErrorMessage,
            },
            'warn',
          );
          logWarn('AgentOrchestrator', 'stt audio capture native finalize failed', {
            recordingSessionId,
            message: stopErrorMessage,
          });
          try {
            await restorePlaybackAudioMode();
          } catch {
            /* ignore */
          }
          return {
            ok: false,
            failureKind: 'finalizeFailed',
            message: stopErrorMessage,
          };
        }
      }

      let stopErrorMessage: string | null = null;
      try {
        await recorder.stop();
      } catch (error) {
        stopErrorMessage = errorMessage(error);
        logMicValidation(
          'endCapture_failed',
          {
            sessionId: sid,
            nativeMicEnabled: isNativeMicCaptureEnabled(),
            selectedPath: 'expo',
            duplicate: false,
            message: stopErrorMessage,
          },
          'warn',
        );
        logWarn('AgentOrchestrator', 'stt audio capture stop raised', {
          recordingSessionId,
          message: stopErrorMessage,
        });
      }
      setIsCapturing(false);
      try {
        const uri = recorder.uri;
        if (!uri) {
          const message =
            stopErrorMessage ??
            'Recorder stop completed without a readable capture URI';
          logWarn(
            'AgentOrchestrator',
            'stt audio capture missing file after stop',
            { recordingSessionId, message },
          );
          return {
            ok: false,
            failureKind: stopErrorMessage ? 'stopFailed' : 'missingFileAfterStop',
            message,
          };
        }
        const file = new File(uri);
        const audioBase64 = await file.base64();
        const filename = uri.split('/').pop() ?? `stt-${Date.now()}.m4a`;
        const durationMillis =
          captureStartedAtRef.current != null
            ? Math.max(0, Date.now() - captureStartedAtRef.current)
            : 0;
        const mimeType = inferMimeType(uri);
        const debugPreservedUri = preserveDebugCapture(
          audioBase64,
          filename,
          recordingSessionId,
        );
        const payload: CapturedSttAudio = {
          audioBase64,
          mimeType,
          filename,
          durationMillis,
          uri,
          ...(debugPreservedUri != null && { debugPreservedUri }),
        };
        logMicValidation('endCapture_native_finalized', {
          sessionId: sid,
          nativeMicEnabled: isNativeMicCaptureEnabled(),
          selectedPath: 'expo',
          duplicate: false,
          filename,
          mimeType,
          sizeBase64Chars: audioBase64.length,
          finalizeLatencyMs:
            validationTimingBySessionRef.current[sid]?.endCaptureCalledAt != null
              ? Math.max(
                  0,
                  nowTs() -
                    (validationTimingBySessionRef.current[sid]
                      ?.endCaptureCalledAt as number),
                )
              : undefined,
        });
        logInfo('AgentOrchestrator', 'stt audio capture completed', {
          recordingSessionId,
          durationMillis,
          filename,
          mimeType,
          sizeBase64Chars: audioBase64.length,
          debugPreservedUri: debugPreservedUri ?? null,
        });
        return { ok: true, capture: payload };
      } catch (error) {
        const message = errorMessage(error);
        logMicValidation(
          'endCapture_failed',
          {
            sessionId: sid,
            nativeMicEnabled: isNativeMicCaptureEnabled(),
            selectedPath: 'expo',
            duplicate: false,
            message,
          },
          'warn',
        );
        logWarn('AgentOrchestrator', 'stt audio capture failed to finalize', {
          recordingSessionId,
          message,
        });
        return {
          ok: false,
          failureKind: 'finalizeFailed',
          message,
        };
      } finally {
        captureStartedAtRef.current = null;
        try {
          await restorePlaybackAudioMode();
        } catch {
          /* ignore */
        }
      }
    },
    [recorder],
  );

  const cancelCapture = useCallback(
    async (recordingSessionId?: string): Promise<void> => {
      const sid = sessionKey(recordingSessionId);
      validationTimingBySessionRef.current[sid] = {
        ...validationTimingBySessionRef.current[sid],
        cancelCalledAt: nowTs(),
      };
      logMicValidation('cancelCapture_called', {
        sessionId: sid,
        nativeMicEnabled: isNativeMicCaptureEnabled(),
        selectedPath: nativeMicActiveRef.current ? 'native' : 'expo',
      });
      if (nativeMicActiveRef.current) {
        try {
          await AtlasNativeMic.cancel(sid);
        } catch (error) {
          const message = errorMessage(error);
          const looksDuplicateNoop =
            message.includes('E_NO_SESSION') || message.includes('No active capture');
          if (looksDuplicateNoop) {
            logMicValidation('cancelCapture_duplicate_noop', {
              sessionId: sid,
              nativeMicEnabled: isNativeMicCaptureEnabled(),
              selectedPath: 'native',
              message,
            });
          } else {
            logMicValidation(
              'cancelCapture_failed',
              {
                sessionId: sid,
                nativeMicEnabled: isNativeMicCaptureEnabled(),
                selectedPath: 'native',
                message,
              },
              'warn',
            );
          }
        } finally {
          lastNativeCaptureRef.current = null;
          nativeMicActiveRef.current = false;
          setIsCapturing(false);
          captureStartedAtRef.current = null;
          const completedAt = nowTs();
          validationTimingBySessionRef.current[sid] = {
            ...validationTimingBySessionRef.current[sid],
            cancelCompletedAt: completedAt,
          };
          logMicValidation('cancelCapture_completed', {
            sessionId: sid,
            nativeMicEnabled: isNativeMicCaptureEnabled(),
            selectedPath: 'native',
            cancelLatencyMs:
              validationTimingBySessionRef.current[sid]?.cancelCalledAt != null
                ? Math.max(
                    0,
                    completedAt -
                      (validationTimingBySessionRef.current[sid]
                        ?.cancelCalledAt as number),
                  )
                : undefined,
          });
          try {
            await restorePlaybackAudioMode();
          } catch {
            /* ignore */
          }
          logInfo('AgentOrchestrator', 'stt audio capture cancelled (native mic)', {
            recordingSessionId,
          });
        }
        return;
      }
      try {
        await recorder.stop();
      } catch (error) {
        const message = errorMessage(error);
        const looksDuplicateNoop =
          message.toLowerCase().includes('not recording') ||
          message.toLowerCase().includes('already');
        if (looksDuplicateNoop) {
          logMicValidation('cancelCapture_duplicate_noop', {
            sessionId: sid,
            nativeMicEnabled: isNativeMicCaptureEnabled(),
            selectedPath: 'expo',
            message,
          });
        } else {
          logMicValidation(
            'cancelCapture_failed',
            {
              sessionId: sid,
              nativeMicEnabled: isNativeMicCaptureEnabled(),
              selectedPath: 'expo',
              message,
            },
            'warn',
          );
        }
      } finally {
        setIsCapturing(false);
        captureStartedAtRef.current = null;
        const completedAt = nowTs();
        validationTimingBySessionRef.current[sid] = {
          ...validationTimingBySessionRef.current[sid],
          cancelCompletedAt: completedAt,
        };
        logMicValidation('cancelCapture_completed', {
          sessionId: sid,
          nativeMicEnabled: isNativeMicCaptureEnabled(),
          selectedPath: 'expo',
          cancelLatencyMs:
            validationTimingBySessionRef.current[sid]?.cancelCalledAt != null
              ? Math.max(
                  0,
                  completedAt -
                    (validationTimingBySessionRef.current[sid]
                      ?.cancelCalledAt as number),
                )
              : undefined,
        });
        try {
          await restorePlaybackAudioMode();
        } catch {
          /* ignore */
        }
        logInfo('AgentOrchestrator', 'stt audio capture cancelled', {
          recordingSessionId,
        });
      }
    },
    [recorder],
  );

  return {
    isCapturing,
    beginCapture,
    endCapture,
    cancelCapture,
  };
}
