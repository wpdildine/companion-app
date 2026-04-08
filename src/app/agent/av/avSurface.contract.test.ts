import {
  runRemoteStopFinalizeMechanics,
  startAvLocalVoiceListeningMechanics,
  startAvRemoteCaptureListeningMechanics,
} from './avSurface';
import type { AvFact } from './avFacts';

describe('avSurface contract guardrails', () => {
  it('emits mechanical facts for local listening start', async () => {
    const emitted: AvFact[] = [];
    let whenReady = -1;
    await startAvLocalVoiceListeningMechanics({
      recordingSessionId: 'rec-1',
      sttProvider: 'local',
      startVoice: async () => undefined,
      onNativeCaptureReady: () => {
        whenReady = emitted.length;
      },
      emitAvFact: fact => {
        emitted.push(fact);
      },
      getSttProviderForLog: () => 'local',
      getSessionSttOverrideApplied: () => false,
      getRecordingStartAt: () => null,
      logInfo: () => undefined,
    });

    expect(whenReady).toBe(0);
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

  it('invokes onNativeCaptureReady after beginCapture, before listening transition', async () => {
    const emitted: AvFact[] = [];
    let whenReady = -1;
    await startAvRemoteCaptureListeningMechanics({
      recordingSessionId: 'rec-remote',
      sttProvider: 'remote',
      beginCapture: async () => true,
      onNativeCaptureReady: () => {
        whenReady = emitted.length;
      },
      emitAvFact: fact => emitted.push(fact),
      getSttProviderForLog: () => 'remote',
      getSessionSttOverrideApplied: () => false,
      getRecordingStartAt: () => null,
      logInfo: () => undefined,
    });

    expect(whenReady).toBe(0);
    expect(emitted[0]).toMatchObject({
      kind: 'av.bookkeeping.listen_path',
      listenPath: 'remote',
      recordingSessionId: 'rec-remote',
    });
    const listeningIdx = emitted.findIndex(
      f => f.kind === 'av.session.transitioned' && f.next === 'listening',
    );
    expect(listeningIdx).toBeGreaterThanOrEqual(0);
    expect(listeningIdx).toBeGreaterThan(whenReady);
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
