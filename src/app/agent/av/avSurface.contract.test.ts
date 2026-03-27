import {
  runRemoteStopFinalizeMechanics,
  startAvLocalVoiceListeningMechanics,
} from './avSurface';
import type { AvFact } from './avFacts';

describe('avSurface contract guardrails', () => {
  it('emits mechanical facts for local listening start (no orchestrator ref callbacks)', async () => {
    const emitted: AvFact[] = [];
    await startAvLocalVoiceListeningMechanics({
      recordingSessionId: 'rec-1',
      sttProvider: 'local',
      startVoice: async () => undefined,
      emitAvFact: fact => {
        emitted.push(fact);
      },
      getSttProviderForLog: () => 'local',
      getSessionSttOverrideApplied: () => false,
      getRecordingStartAt: () => null,
      logInfo: () => undefined,
    });

    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'av.bookkeeping.listen_path',
          listenPath: 'local',
          recordingSessionId: 'rec-1',
        }),
        expect.objectContaining({
          kind: 'av.session.transitioned',
          next: 'listening',
          recordingSessionId: 'rec-1',
        }),
        expect.objectContaining({
          kind: 'av.bookkeeping.listen_in_signal',
          recordingSessionId: 'rec-1',
        }),
      ]),
    );
  });

  it('returns non-semantic STT completion fact and emits settling + pending capture facts', async () => {
    const emitted: AvFact[] = [];
    const fact = await runRemoteStopFinalizeMechanics({
      recordingSessionId: 'rec-2',
      endCapture: async () => ({
        ok: true,
        capture: {
          uri: 'file://capture.webm',
          filename: 'capture.webm',
          mimeType: 'audio/webm',
          audioBase64: 'abc',
          durationMillis: 10,
        },
      }),
      transcribeCapturedAudioIfNeeded: async () => true,
      emitAvFact: next => emitted.push(next),
      getLastRemoteSttEmpty: () => false,
      settleTimeoutMs: 100,
    });

    expect(fact.kind).toBe('av.stt.completed');
    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'av.bookkeeping.pending_captured_audio_set',
          recordingSessionId: 'rec-2',
        }),
        expect.objectContaining({
          kind: 'av.session.transitioned',
          next: 'settling',
          recordingSessionId: 'rec-2',
        }),
      ]),
    );
  });
});
