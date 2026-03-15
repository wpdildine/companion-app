/**
 * Unit tests for remote STT coordinator: wait for capture, transcribe, normalize, failure callback.
 */

import type { CapturedSttAudio } from '../../hooks/useSttAudioCapture';
import {
  createRemoteSttCoordinator,
  REMOTE_STT_CAPTURE_POLL_MS,
  REMOTE_STT_CAPTURE_WAIT_MS,
} from './remoteStt';

const mockCaptured: CapturedSttAudio = {
  filename: 'capture.webm',
  mimeType: 'audio/webm',
  durationMillis: 100,
  audioBase64: 'base64data',
};

describe('createRemoteSttCoordinator', () => {
  const mockTranscribe = jest.fn();
  let pendingCapture: CapturedSttAudio | null = null;
  let appliedText: string | null = null;
  let failureArgs: { message: string; recordingSessionId?: string } | null =
    null;

  const deps = {
    getPendingCapture: () => pendingCapture,
    clearPendingCapture: () => {
      pendingCapture = null;
    },
    applyTranscript: (text: string) => {
      appliedText = text;
    },
    transcribeAudio: mockTranscribe,
    getEndpointBaseUrl: () => 'http://test',
    onFailure: (message: string, recordingSessionId?: string) => {
      failureArgs = { message, recordingSessionId };
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pendingCapture = null;
    appliedText = null;
    failureArgs = null;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits for pending capture then transcribes and applies', async () => {
    pendingCapture = null;
    const { transcribeCapturedAudioIfNeeded } =
      createRemoteSttCoordinator(deps);
    const promise = transcribeCapturedAudioIfNeeded('rec-1');
    await jest.advanceTimersByTimeAsync(REMOTE_STT_CAPTURE_POLL_MS * 2);
    pendingCapture = { ...mockCaptured };
    mockTranscribe.mockResolvedValue({ text: '  hello world  ' });
    await jest.advanceTimersByTimeAsync(REMOTE_STT_CAPTURE_POLL_MS);
    const result = await promise;
    expect(result).toBe(true);
    expect(mockTranscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        audioBase64: 'base64data',
        language: 'en',
      }),
    );
    expect(appliedText).toBe('hello world');
    expect(failureArgs).toBeNull();
  });

  it('times out cleanly when capture never arrives and calls onFailure', async () => {
    const { transcribeCapturedAudioIfNeeded } =
      createRemoteSttCoordinator(deps);
    const promise = transcribeCapturedAudioIfNeeded('rec-1');
    jest.advanceTimersByTime(REMOTE_STT_CAPTURE_WAIT_MS + 100);
    const result = await promise;
    expect(result).toBe(false);
    expect(failureArgs?.message).toContain('no uploadable audio');
    expect(failureArgs?.recordingSessionId).toBe('rec-1');
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('normalizes transcript on success and clears pending', async () => {
    pendingCapture = { ...mockCaptured };
    mockTranscribe.mockResolvedValue({ text: '  foo   bar  \n' });
    const { transcribeCapturedAudioIfNeeded } =
      createRemoteSttCoordinator(deps);
    const result = await transcribeCapturedAudioIfNeeded('rec-1');
    expect(result).toBe(true);
    expect(appliedText).toBe('foo bar');
    expect(pendingCapture).toBeNull();
  });

  it('calls onEmptyTranscript (recoverable) when transcribe returns empty/whitespace text', async () => {
    pendingCapture = { ...mockCaptured };
    mockTranscribe.mockResolvedValue({ text: '   \n\t  ' });
    let emptyCalled = false;
    const { transcribeCapturedAudioIfNeeded } = createRemoteSttCoordinator({
      ...deps,
      onEmptyTranscript: () => {
        emptyCalled = true;
      },
    });
    const result = await transcribeCapturedAudioIfNeeded('rec-1');
    expect(result).toBe(false);
    expect(emptyCalled).toBe(true);
    expect(failureArgs).toBeNull();
    expect(appliedText).toBeNull();
    expect(pendingCapture).toBeNull();
  });

  it('calls onFailure when transcribe throws', async () => {
    pendingCapture = { ...mockCaptured };
    mockTranscribe.mockRejectedValue(new Error('Network error'));
    const { transcribeCapturedAudioIfNeeded } =
      createRemoteSttCoordinator(deps);
    const result = await transcribeCapturedAudioIfNeeded('rec-1');
    expect(result).toBe(false);
    expect(failureArgs?.message).toBe('Network error');
    expect(appliedText).toBeNull();
  });
});
