import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useAgentOrchestrator } from '../useAgentOrchestrator';
import type { AgentOrchestratorActions } from '../useAgentOrchestrator';
import type { AgentOrchestratorListeners, AgentOrchestratorState } from '../types';
import Voice from '@react-native-voice/voice';
import * as rag from '../../../rag';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  NativeModules: {
    Voice: {
      startSpeech: jest.fn(),
      stopSpeech: jest.fn(),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    },
    RCTVoice: null,
    RagPackReader: null,
    RagPackReaderModule: null,
  },
}));

jest.mock('@react-native-voice/voice', () => ({
  __esModule: true,
  default: {
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    destroy: jest.fn(() => Promise.resolve()),
    removeAllListeners: jest.fn(),
    onSpeechResults: null,
    onSpeechPartialResults: null,
    onSpeechError: null,
    onSpeechEnd: null,
  },
}));

jest.mock('piper-tts', () => ({
  __esModule: true,
  default: {
    isModelAvailable: jest.fn(() => Promise.resolve(true)),
    speak: jest.fn(() => Promise.resolve()),
    setOptions: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('react-native-tts', () => ({
  __esModule: true,
  default: {
    getInitStatus: jest.fn(() => Promise.resolve()),
    speak: jest.fn(),
    stop: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
}));

jest.mock('expo-audio', () => ({
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn(() => Promise.resolve()),
    record: jest.fn(),
    stop: jest.fn(() => Promise.resolve()),
    uri: 'file:///tmp/mock-recording.m4a',
  })),
  requestRecordingPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true, status: 'granted' }),
  ),
  RecordingPresets: {
    HIGH_QUALITY: {},
  },
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn((...args: unknown[]) => ({
    uri: typeof args[args.length - 1] === 'string' ? String(args[args.length - 1]) : 'file:///tmp/mock-recording.m4a',
    base64: jest.fn(() => Promise.resolve('')),
    create: jest.fn(),
    write: jest.fn(),
  })),
  Directory: jest.fn(() => ({
    create: jest.fn(),
    uri: 'file:///documents/debug-stt-captures',
  })),
  Paths: {
    document: {
      uri: 'file:///documents',
    },
  },
}));

jest.mock('../../../rag', () => ({
  BUNDLE_PACK_ROOT: 'content_pack',
  copyBundlePackToDocuments: jest.fn(),
  createBundlePackReader: jest.fn(),
  createDocumentsPackReader: jest.fn(),
  createThrowReader: jest.fn(),
  getContentPackPathInDocuments: jest.fn(),
  getPackEmbedModelId: jest.fn(),
  getPackState: jest.fn(() => ({})),
  ask: jest.fn(),
  init: jest.fn(),
}));

type ContractEvent =
  | { type: 'lifecycle'; value: string }
  | { type: 'request_start'; requestId: number }
  | { type: 'request_failed'; requestId: number; lifecycle?: string }
  | { type: 'request_complete'; requestId: number }
  | { type: 'response_settled'; requestId: number }
  | { type: 'tts_start'; requestId: number }
  | { type: 'tts_end'; requestId: number };

function createEventRecorder() {
  const events: ContractEvent[] = [];
  return {
    record: (event: ContractEvent) => events.push(event),
    events,
  };
}

const flushPromises = () => new Promise<void>(resolve => setImmediate(() => resolve()));

const mockAskResult = () => ({
  raw: 'Hello there',
  nudged: 'Hello there',
  validationSummary: {
    cards: [],
    rules: [],
    stats: { cardHitRate: 0, ruleHitRate: 0, unknownCardCount: 0, invalidRuleCount: 0 },
  },
});

type Harness = {
  actions: AgentOrchestratorActions;
  getState: () => AgentOrchestratorState;
  unmount: () => void;
};

function createHarness(recorder: ReturnType<typeof createEventRecorder>): Harness {
  const listenersRef = React.createRef<AgentOrchestratorListeners | null>();
  const requestDebugSinkRef = React.createRef<((payload: {
    type: string;
    requestId?: number | null;
    lifecycle?: string;
  }) => void) | null>();
  let currentState: AgentOrchestratorState | null = null;
  let currentActions: AgentOrchestratorActions | null = null;

  const recordDebugEvent = (payload: {
    type: string;
    requestId?: number | null;
    lifecycle?: string;
  }) => {
    const requestId = payload.requestId;
    if (typeof requestId !== 'number') return;
    if (payload.type === 'request_start') {
      recorder.record({ type: 'request_start', requestId });
    } else if (payload.type === 'request_failed') {
      recorder.record({ type: 'request_failed', requestId, lifecycle: payload.lifecycle });
    } else if (payload.type === 'response_settled') {
      recorder.record({ type: 'response_settled', requestId });
    } else if (payload.type === 'tts_start') {
      recorder.record({ type: 'tts_start', requestId });
    } else if (payload.type === 'tts_end') {
      recorder.record({ type: 'tts_end', requestId });
    } else if (payload.type === 'request_complete') {
      recorder.record({ type: 'request_complete', requestId });
    }
  };

  requestDebugSinkRef.current = recordDebugEvent;

  const HarnessComponent = () => {
    const orchestrator = useAgentOrchestrator({
      listenersRef,
      requestDebugSinkRef,
    });
    currentState = orchestrator.state;
    currentActions = orchestrator.actions;
    const lastLifecycleRef = React.useRef<string | null>(null);
    if (lastLifecycleRef.current !== orchestrator.state.lifecycle) {
      recorder.record({ type: 'lifecycle', value: orchestrator.state.lifecycle });
      lastLifecycleRef.current = orchestrator.state.lifecycle;
    }

    return null;
  };

  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(HarnessComponent));
  });

  if (!currentActions || !currentState) {
    throw new Error('Orchestrator harness failed to initialize.');
  }

  return {
    actions: currentActions,
    getState: (): AgentOrchestratorState => currentState!,
    unmount: () => {
      act(() => {
        renderer!.unmount();
      });
    },
  };
}

const findEventIndex = (
  events: ContractEvent[],
  predicate: (event: ContractEvent) => boolean,
  startAt = 0,
) => events.findIndex((event, index) => index >= startAt && predicate(event));

const emitFinalTranscript = async (harness: Harness, text: string) => {
  await act(async () => {
    await harness.actions.startListening(true);
    await flushPromises();
  });

  const voiceModule = Voice as unknown as { onSpeechResults?: (e: { value?: string[] }) => void };
  act(() => {
    voiceModule.onSpeechResults?.({ value: [text] });
  });
};

describe('AgentOrchestrator contract events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (rag.ask as jest.Mock).mockResolvedValue(mockAskResult());
  });

  it('success path ordering', async () => {
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
    });

    const { events } = recorder;
    const responseSettledIndex = findEventIndex(
      events,
      event => event.type === 'response_settled',
    );
    const ttsStartIndex = findEventIndex(events, event => event.type === 'tts_start');
    const ttsEndIndex = findEventIndex(events, event => event.type === 'tts_end');
    const idleIndex = findEventIndex(
      events,
      event => event.type === 'lifecycle' && event.value === 'idle',
      ttsEndIndex + 1,
    );
    const requestCompleteIndex = findEventIndex(
      events,
      event => event.type === 'request_complete',
    );

    expect(responseSettledIndex).toBeGreaterThanOrEqual(0);
    expect(ttsStartIndex).toBeGreaterThanOrEqual(0);
    expect(ttsEndIndex).toBeGreaterThanOrEqual(0);
    expect(idleIndex).toBeGreaterThanOrEqual(0);
    expect(requestCompleteIndex).toBeGreaterThanOrEqual(0);

    expect(responseSettledIndex).toBeLessThan(ttsStartIndex);
    expect(idleIndex).toBeLessThan(requestCompleteIndex);
    expect(requestCompleteIndex).toBeGreaterThan(idleIndex);

    harness.unmount();
  });

  it('no usable transcript', async () => {
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    await act(async () => {
      await harness.actions.startListening(true);
      await flushPromises();
    });

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
    });

    await act(async () => {
      await harness.actions.stopListening();
      await new Promise<void>(resolve => setTimeout(() => resolve(), 700));
    });

    const { events } = recorder;
    const hasRequestStart = events.some(event => event.type === 'request_start');
    const idleIndex = findEventIndex(
      events,
      event => event.type === 'lifecycle' && event.value === 'idle',
    );

    expect(hasRequestStart).toBe(false);
    expect(idleIndex).toBeGreaterThanOrEqual(0);
    expect(harness.getState().lifecycle).toBe('idle');

    harness.unmount();
  });

  it('stale callback protection', async () => {
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    let resolveAsk: ((value: ReturnType<typeof mockAskResult>) => void) | null = null;
    (rag.ask as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveAsk = resolve;
        }),
    );

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      void harness.actions.submit();
      await flushPromises();
    });

    const requestStartIndex = findEventIndex(
      recorder.events,
      event => event.type === 'request_start',
    );
    expect(requestStartIndex).toBeGreaterThanOrEqual(0);

    await act(async () => {
      harness.actions.recoverFromRequestFailure();
      await flushPromises();
    });

    expect(harness.getState().lifecycle).toBe('idle');

    await act(async () => {
      resolveAsk?.(mockAskResult());
      await flushPromises();
      await flushPromises();
    });

    const hasResponseSettled = recorder.events.some(
      event => event.type === 'response_settled',
    );
    const hasTtsStart = recorder.events.some(event => event.type === 'tts_start');
    const hasRequestComplete = recorder.events.some(
      event => event.type === 'request_complete',
    );

    expect(hasResponseSettled).toBe(false);
    expect(hasTtsStart).toBe(false);
    expect(hasRequestComplete).toBe(false);
    expect(harness.getState().lifecycle).toBe('idle');

    harness.unmount();
  });

  it('submit denied while processing', async () => {
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    let resolveAsk: ((value: ReturnType<typeof mockAskResult>) => void) | null = null;
    (rag.ask as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveAsk = resolve;
        }),
    );

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      void harness.actions.submit();
      await flushPromises();
    });

    const requestStartCountAfterFirst = recorder.events.filter(
      e => e.type === 'request_start',
    ).length;
    expect(requestStartCountAfterFirst).toBe(1);
    expect(harness.getState().lifecycle).toBe('processing');

    let secondSubmitResult: string | null | undefined;
    await act(async () => {
      secondSubmitResult = await harness.actions.submit();
      await flushPromises();
    });

    expect(secondSubmitResult).toBe(null);
    const requestStartCountAfterSecond = recorder.events.filter(
      e => e.type === 'request_start',
    ).length;
    expect(requestStartCountAfterSecond).toBe(1);

    await act(async () => {
      resolveAsk?.(mockAskResult());
      await flushPromises();
      await flushPromises();
    });

    harness.unmount();
  });

  it('submit denied while speaking', async () => {
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);
    const piperTts = require('piper-tts').default as { speak: jest.Mock };
    piperTts.speak.mockImplementationOnce(() => new Promise<void>(() => {}));

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
    });

    expect(harness.getState().lifecycle).toBe('speaking');
    const requestStartCountAfterFirst = recorder.events.filter(
      e => e.type === 'request_start',
    ).length;
    expect(requestStartCountAfterFirst).toBe(1);

    let secondSubmitResult: string | null | undefined;
    await act(async () => {
      secondSubmitResult = await harness.actions.submit();
      await flushPromises();
    });

    expect(secondSubmitResult).toBe(null);
    const requestStartCountAfterSecond = recorder.events.filter(
      e => e.type === 'request_start',
    ).length;
    expect(requestStartCountAfterSecond).toBe(1);

    harness.unmount();
  });

  it('request_failed emits lifecycle error payload', async () => {
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);
    (rag.ask as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
    });

    const failedEvent = recorder.events.find(
      (e): e is Extract<ContractEvent, { type: 'request_failed' }> =>
        e.type === 'request_failed',
    );
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.lifecycle).toBe('error');
    expect(
      recorder.events.some(event => event.type === 'response_settled'),
    ).toBe(false);
    expect(
      recorder.events.some(event => event.type === 'request_complete'),
    ).toBe(false);
    expect(
      recorder.events.some(event => event.type === 'tts_start'),
    ).toBe(false);

    harness.unmount();
  });

  it('exposes audioSessionState changes reactively during stop-for-submit', async () => {
    let resolveTranscript: ((value: { text: string }) => void) | null = null;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        new Promise(resolve => {
          resolveTranscript = resolve;
        }),
    } as Response);
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    await act(async () => {
      await harness.actions.startListening(true);
      await flushPromises();
    });

    expect(harness.getState().audioSessionState).toBe('listening');

    let stopPromise: Promise<void> | null = null;
    await act(async () => {
      stopPromise = harness.actions.stopListeningAndRequestSubmit();
      await flushPromises();
    });

    expect(harness.getState().audioSessionState).not.toBe('listening');
    expect(['stopping', 'settling']).toContain(
      harness.getState().audioSessionState,
    );

    await act(async () => {
      resolveTranscript?.({ text: 'Remote transcript' });
      await stopPromise;
      await flushPromises();
    });

    harness.unmount();
    fetchMock.mockRestore();
  });

  it('playback ordering', async () => {
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
    });

    const { events } = recorder;
    const responseSettledIndex = findEventIndex(
      events,
      event => event.type === 'response_settled',
    );
    const ttsStartIndex = findEventIndex(events, event => event.type === 'tts_start');
    const ttsEndIndex = findEventIndex(events, event => event.type === 'tts_end');
    const idleIndex = findEventIndex(
      events,
      event => event.type === 'lifecycle' && event.value === 'idle',
      ttsEndIndex + 1,
    );
    const requestCompleteIndex = findEventIndex(
      events,
      event => event.type === 'request_complete',
    );

    expect(responseSettledIndex).toBeGreaterThanOrEqual(0);
    expect(ttsStartIndex).toBeGreaterThanOrEqual(0);
    expect(ttsEndIndex).toBeGreaterThanOrEqual(0);
    expect(idleIndex).toBeGreaterThanOrEqual(0);
    expect(requestCompleteIndex).toBeGreaterThanOrEqual(0);

    expect(responseSettledIndex).toBeLessThan(ttsStartIndex);
    expect(ttsStartIndex).toBeLessThan(ttsEndIndex);
    expect(ttsEndIndex).toBeLessThan(idleIndex);
    expect(idleIndex).toBeLessThan(requestCompleteIndex);

    harness.unmount();
  });

  it('remote stt transcript is fetched and used after stopListeningAndRequestSubmit', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Remote transcript' }),
    } as Response);
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    await act(async () => {
      await harness.actions.startListening(true);
      await flushPromises();
    });

    await act(async () => {
      await harness.actions.stopListeningAndRequestSubmit();
      await flushPromises();
    });

    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.54:8787/api/stt',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(harness.getState().transcribedText).toBe('Remote transcript');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
    });

    harness.unmount();
    fetchMock.mockRestore();
  });

  it('returns audioSessionState to idleReady when remote stt transcript is empty', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: '   ' }),
    } as Response);
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    await act(async () => {
      await harness.actions.startListening(true);
      await flushPromises();
    });

    await act(async () => {
      await harness.actions.stopListeningAndRequestSubmit();
      await flushPromises();
      await flushPromises();
    });

    expect(harness.getState().audioSessionState).toBe('idleReady');
    expect(harness.getState().lifecycle).toBe('idle');
    expect(harness.getState().transcribedText).toBe('');

    harness.unmount();
    fetchMock.mockRestore();
  });
});
