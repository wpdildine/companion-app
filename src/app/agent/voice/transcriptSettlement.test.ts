/**
 * Unit tests for transcript settlement: quiet window, flush boundary, candidate selection, empty transcript.
 */

import {
  createTranscriptSettlementCoordinator,
  normalizeTranscript,
  transcriptPreview,
  transcriptTrace,
  POST_SPEECH_END_QUIET_WINDOW_MS,
  POST_STOP_FLUSH_WINDOW_MS,
} from './transcriptSettlement';

describe('transcriptSettlement helpers', () => {
  describe('normalizeTranscript', () => {
    it('trims and collapses whitespace', () => {
      expect(normalizeTranscript('  hello   world  ')).toBe('hello world');
    });
    it('returns empty string for empty input', () => {
      expect(normalizeTranscript('')).toBe('');
      expect(normalizeTranscript('   ')).toBe('');
    });
  });

  describe('transcriptPreview', () => {
    it('returns full text when <= 120 chars', () => {
      const short = 'a'.repeat(100);
      expect(transcriptPreview(short)).toBe(short);
    });
    it('truncates with ... when over 120 chars', () => {
      const long = 'a'.repeat(150);
      expect(transcriptPreview(long)).toHaveLength(120);
      expect(transcriptPreview(long).endsWith('...')).toBe(true);
    });
  });

  describe('transcriptTrace', () => {
    it('returns chars, text, preview', () => {
      const t = transcriptTrace('  foo  bar  ');
      expect(t.chars).toBe(7);
      expect(t.text).toBe('foo bar');
      expect(t.preview).toBe('foo bar');
    });
  });
});

describe('createTranscriptSettlementCoordinator', () => {
  const mockDeps = {
    getPartialTranscript: jest.fn(() => ''),
    getTranscribedText: jest.fn(() => ''),
    updateTranscript: jest.fn(),
    getSpeechEnded: jest.fn(() => false),
    getAudioState: jest.fn(() => 'listening' as const),
    setAudioState: jest.fn(),
    getIosStopPending: jest.fn(() => false),
    getIosStopInvoked: jest.fn(() => true),
    getPendingSubmitWhenReady: jest.fn(() => false),
    getRecordingSessionId: jest.fn(() => null),
    getPendingSubmitSessionId: jest.fn(() => null),
    getVoiceRef: jest.fn(() => null),
    clearIosStopGraceTimer: jest.fn(),
    finalizeTranscriptFromPartial: jest.fn(),
    onFinalizeComplete: jest.fn(),
    onTranscriptReadyForSubmit: jest.fn(),
    onListeningEnd: jest.fn(),
    emitRecoverableFailure: jest.fn(),
    transcribeCapturedAudioIfNeeded: jest.fn(() => Promise.resolve(true)),
    getVoiceNative: jest.fn(() => null),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockDeps.getTranscribedText.mockReturnValue('');
    mockDeps.getPartialTranscript.mockReturnValue('');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('quiet window expiry', () => {
    it('schedules quiet window and resolves on expiry', async () => {
      mockDeps.getPartialTranscript.mockReturnValue('partial');
      mockDeps.getTranscribedText.mockReturnValue('current');
      mockDeps.getPendingSubmitWhenReady.mockReturnValue(true);
      (mockDeps.getRecordingSessionId as jest.Mock).mockReturnValue('s1');
      (mockDeps.getPendingSubmitSessionId as jest.Mock).mockReturnValue('s1');

      const coord = createTranscriptSettlementCoordinator(mockDeps as any);
      const onResolved = jest.fn();
      coord.setPendingSubmit('s1');
      coord.startQuietWindow('s1', onResolved);

      jest.advanceTimersByTime(POST_SPEECH_END_QUIET_WINDOW_MS);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockDeps.updateTranscript).toHaveBeenCalled();
      expect(onResolved).toHaveBeenCalledWith({ kind: 'ready', shouldSubmit: true });
    });
  });

  describe('flush boundary expiry', () => {
    it('scheduleFlushWindow invokes callback after POST_STOP_FLUSH_WINDOW_MS', () => {
      const coord = createTranscriptSettlementCoordinator(mockDeps as any);
      const onFlush = jest.fn();
      coord.scheduleFlushWindow(onFlush);
      expect(onFlush).not.toHaveBeenCalled();
      jest.advanceTimersByTime(POST_STOP_FLUSH_WINDOW_MS);
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
  });

  describe('final vs partial candidate selection', () => {
    it('acceptFinalCandidate updates when combined is longer', () => {
      const coord = createTranscriptSettlementCoordinator(mockDeps as any);
      coord.acceptFinalCandidate('short', 's1');
      expect(coord.getFinalCandidateText()).toBe('short');
      coord.acceptFinalCandidate('longer text', 's1');
      expect(coord.getFinalCandidateText()).toBe('longer text');
    });
    it('acceptFinalCandidate does not replace when current is longer', () => {
      const coord = createTranscriptSettlementCoordinator(mockDeps as any);
      coord.acceptFinalCandidate('longer text', 's1');
      coord.acceptFinalCandidate('short', 's1');
      expect(coord.getFinalCandidateText()).toBe('longer text');
    });
    it('acceptFinalCandidate does not replace when committed transcript is longer than incoming', () => {
      const coord = createTranscriptSettlementCoordinator(mockDeps as any);
      coord.acceptFinalCandidate('short', 's1');
      mockDeps.getTranscribedText.mockReturnValue(
        'already committed longer line',
      );
      coord.acceptFinalCandidate('medium', 's1');
      expect(coord.getFinalCandidateText()).toBe('short');
    });
  });

  describe('finalizeStop', () => {
    it('clears timers and calls finalizeTranscriptFromPartial', () => {
      const coord = createTranscriptSettlementCoordinator(mockDeps as any);
      coord.finalizeStop('testReason', 's1');
      expect(mockDeps.finalizeTranscriptFromPartial).toHaveBeenCalledWith('testReason', 's1');
    });
  });

  describe('getSettlementResolved', () => {
    it('returns false until resolveSettlement runs', () => {
      mockDeps.getPartialTranscript.mockReturnValue('');
      mockDeps.getTranscribedText.mockReturnValue('some text');
      const coord = createTranscriptSettlementCoordinator(mockDeps as any);
      expect(coord.getSettlementResolved()).toBe(false);
    });
  });
});
