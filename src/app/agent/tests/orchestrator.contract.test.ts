import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useAgentOrchestrator } from '../useAgentOrchestrator';
import type { AgentOrchestratorActions } from '../useAgentOrchestrator';
import type { AgentOrchestratorListeners, AgentOrchestratorState } from '../types';
import Voice from '@react-native-voice/voice';
import * as rag from '../../../rag';
import * as scriptedResponses from '../scripted/scriptedResponses';
import {
  AMBIGUOUS_ENTITY_RESPONSES,
  INSUFFICIENT_CONTEXT_RESPONSES,
  RESTATES_REQUEST_RESPONSES,
} from '../scripted/scriptedResponses';

const mockGetSttProvider = jest.fn<
  'local' | 'remote' | 'remote_with_local_fallback',
  []
>(() => 'local');
const mockGetEndpointBaseUrl = jest.fn<string | null, []>(
  () => 'http://192.168.1.54:8787',
);
const mockRecorderPrepareToRecordAsync = jest.fn(() => Promise.resolve());
const mockRecorderRecord = jest.fn();
const mockRecorderStop = jest.fn(() => Promise.resolve());
let mockRecorderUri = 'file:///tmp/mock-recording.m4a';

jest.mock('../../../shared/config/endpointConfig', () => {
  const actual = jest.requireActual<
    typeof import('../../../shared/config/endpointConfig')
  >('../../../shared/config/endpointConfig');
  return {
    ...actual,
    getSttProvider: () => mockGetSttProvider(),
    getEndpointBaseUrl: () => mockGetEndpointBaseUrl(),
    snapshotSttResolution: () => ({
      provider: mockGetSttProvider(),
      overrideApplied: false,
    }),
    resolveSttProvider: () => mockGetSttProvider(),
    /** Tests use expo-audio mock; native mic path needs native modules not present in Jest. */
    isNativeMicCaptureEnabled: () => false,
  };
});

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

const mockRnTts = () =>
  require('react-native-tts').default as {
    getInitStatus: jest.Mock;
    speak: jest.Mock;
    removeEventListener: jest.Mock;
  };

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

jest.mock('expo-audio', () => {
  class MockAudioRecorder {
    prepareToRecordAsync = mockRecorderPrepareToRecordAsync;
    record = mockRecorderRecord;
    stop = mockRecorderStop;
    release = jest.fn();
    get uri() {
      return mockRecorderUri;
    }
  }
  return {
    useAudioRecorder: jest.fn(() => ({
      prepareToRecordAsync: mockRecorderPrepareToRecordAsync,
      record: mockRecorderRecord,
      stop: mockRecorderStop,
      get uri() {
        return mockRecorderUri;
      },
    })),
    getRecordingPermissionsAsync: jest.fn(() =>
      Promise.resolve({ granted: true, status: 'granted' }),
    ),
    requestRecordingPermissionsAsync: jest.fn(() =>
      Promise.resolve({ granted: true, status: 'granted' }),
    ),
    RecordingPresets: {
      HIGH_QUALITY: {},
    },
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    AudioModule: {
      AudioRecorder: MockAudioRecorder,
    },
  };
});

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
  | {
      type: 'request_complete';
      requestId: number;
      playbackOutcome?: string;
    }
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
  listeners: AgentOrchestratorListeners;
  unmount: () => void;
};

function createHarness(
  recorder: ReturnType<typeof createEventRecorder>,
  listenerOverrides: Partial<AgentOrchestratorListeners> = {},
): Harness {
  const listenersRef = React.createRef<AgentOrchestratorListeners | null>();
  const requestDebugSinkRef = React.createRef<((payload: {
    type: string;
    requestId?: number | null;
    lifecycle?: string;
    playbackOutcome?: string;
  }) => void) | null>();
  let currentState: AgentOrchestratorState | null = null;
  let currentActions: AgentOrchestratorActions | null = null;

  const recordDebugEvent = (payload: {
    type: string;
    requestId?: number | null;
    lifecycle?: string;
    playbackOutcome?: string;
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
      recorder.record({
        type: 'request_complete',
        requestId,
        playbackOutcome: payload.playbackOutcome,
      });
    }
  };

  requestDebugSinkRef.current = recordDebugEvent;
  const listeners: AgentOrchestratorListeners = {
    ...listenerOverrides,
  };
  listenersRef.current = listeners;

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
    listeners,
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
    mockGetSttProvider.mockReset();
    mockGetSttProvider.mockReturnValue('local');
    mockGetEndpointBaseUrl.mockReturnValue('http://192.168.1.54:8787');
    mockRecorderStop.mockResolvedValue(undefined);
    mockRecorderUri = 'file:///tmp/mock-recording.m4a';
    (rag.ask as jest.Mock).mockReset();
    (rag.ask as jest.Mock).mockResolvedValue(mockAskResult());
    const piperTts = require('piper-tts').default as {
      speak: jest.Mock;
      stop: jest.Mock;
      isModelAvailable: jest.Mock;
    };
    piperTts.speak.mockReset();
    piperTts.speak.mockImplementation(() => Promise.resolve());
    piperTts.stop.mockReset();
    piperTts.stop.mockImplementation(() => undefined);
    piperTts.isModelAvailable.mockReset();
    piperTts.isModelAvailable.mockResolvedValue(true);
    mockRnTts().getInitStatus.mockReset();
    mockRnTts().getInitStatus.mockResolvedValue(undefined);
    mockRnTts().speak.mockReset();
    mockRnTts().removeEventListener.mockReset();
  });

  it('success path ordering', async () => {
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
      await new Promise<void>(resolve => setTimeout(resolve, 40));
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

  it('insufficient_context completion commits scripted line and plays TTS', async () => {
    jest
      .spyOn(scriptedResponses, 'pickRandomResponse')
      .mockImplementation(list => list[0] ?? '');
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);
    (rag.ask as jest.Mock).mockResolvedValueOnce({
      raw: 'Insufficient retrieved context.',
      nudged: 'Insufficient retrieved context.',
      failure_intent: 'insufficient_context',
      validationSummary: {
        cards: [],
        rules: [],
        stats: {
          cardHitRate: 0,
          ruleHitRate: 0,
          unknownCardCount: 0,
          invalidRuleCount: 0,
        },
      },
    });

    await emitFinalTranscript(harness, 'test query');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
      await new Promise<void>(resolve => setTimeout(resolve, 40));
      await flushPromises();
    });

    expect(harness.getState().responseText).toBe(INSUFFICIENT_CONTEXT_RESPONSES[0] ?? null);
    expect(recorder.events.some(e => e.type === 'tts_start')).toBe(true);
    jest.restoreAllMocks();
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
      harness.actions.submit();
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
      harness.actions.submit();
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
    mockGetSttProvider.mockReturnValue('remote');
    let resolveTranscript: ((value: { text: string }) => void) | null = null;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
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
      await new Promise<void>(resolve => setTimeout(resolve, 50));
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
      await flushPromises();
      await new Promise<void>(resolve => setTimeout(resolve, 80));
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

  it('playback cancel emits exactly one tts_end and request_complete with cancelled outcome', async () => {
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);
    const piperTts = require('piper-tts').default as {
      speak: jest.Mock;
      stop: jest.Mock;
    };
    let rejectSpeak: ((e: unknown) => void) | undefined;
    piperTts.speak.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectSpeak = reject;
        }),
    );
    piperTts.stop.mockImplementation(() => {
      rejectSpeak?.(
        Object.assign(new Error('Playback stopped'), { code: 'E_CANCELLED' }),
      );
    });

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
    });

    expect(harness.getState().lifecycle).toBe('speaking');

    await act(async () => {
      harness.actions.cancelPlayback();
      await flushPromises();
      await flushPromises();
      await new Promise<void>(r => setTimeout(r, 60));
      await flushPromises();
    });

    expect(recorder.events.filter(e => e.type === 'tts_end').length).toBe(1);
    const reqComplete = recorder.events.find(
      (e): e is Extract<ContractEvent, { type: 'request_complete' }> =>
        e.type === 'request_complete',
    );
    expect(reqComplete).toBeDefined();
    expect(reqComplete?.playbackOutcome).toBe('cancelled');
    expect(harness.getState().lifecycle).toBe('idle');

    harness.unmount();
  });

  it('playback failure emits one tts_end and request_complete with failed outcome', async () => {
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);
    const piperTts = require('piper-tts').default as { speak: jest.Mock };
    piperTts.speak.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('synth failed'), { code: 'E_SYNTHESIS' }),
      ),
    );

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
      await new Promise<void>(r => setTimeout(r, 60));
      await flushPromises();
    });

    expect(recorder.events.filter(e => e.type === 'tts_end').length).toBe(1);
    const reqComplete = recorder.events.find(
      (e): e is Extract<ContractEvent, { type: 'request_complete' }> =>
        e.type === 'request_complete',
    );
    expect(reqComplete?.playbackOutcome).toBe('failed');
    expect(harness.getState().lifecycle).toBe('error');

    harness.unmount();
  });

  it('fallback tts: sync speak failure after start emits one tts_end failed via applyAvFact', async () => {
    const recorder = createEventRecorder();
    const piperTts = require('piper-tts').default as {
      isModelAvailable: jest.Mock;
    };
    piperTts.isModelAvailable.mockResolvedValue(false);
    mockRnTts().speak.mockImplementation(() => {
      throw new Error('fallback sync speak error');
    });
    const harness = createHarness(recorder);

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
      await new Promise<void>(r => setTimeout(r, 60));
      await flushPromises();
    });

    expect(recorder.events.filter(e => e.type === 'tts_start').length).toBe(1);
    expect(recorder.events.filter(e => e.type === 'tts_end').length).toBe(1);
    const reqComplete = recorder.events.find(
      (e): e is Extract<ContractEvent, { type: 'request_complete' }> =>
        e.type === 'request_complete',
    );
    expect(reqComplete?.playbackOutcome).toBe('failed');
    expect(harness.getState().lifecycle).toBe('error');

    harness.unmount();
  });

  it('remote stt transcript is fetched and used after stopListeningAndRequestSubmit', async () => {
    mockGetSttProvider.mockReturnValue('remote');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Remote transcript' }),
    } as Response);
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    await act(async () => {
      await harness.actions.startListening(true);
      await flushPromises();
      await new Promise<void>(resolve => setTimeout(resolve, 50));
      await flushPromises();
    });

    await act(async () => {
      await harness.actions.stopListeningAndRequestSubmit();
      await flushPromises();
    });

    await act(async () => {
      await flushPromises();
      await flushPromises();
      await new Promise<void>(resolve => setTimeout(resolve, 50));
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
    mockGetSttProvider.mockReturnValue('remote');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: '   ' }),
    } as Response);
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);

    await act(async () => {
      await harness.actions.startListening(true);
      await flushPromises();
      await new Promise<void>(resolve => setTimeout(resolve, 50));
      await flushPromises();
    });

    await act(async () => {
      await harness.actions.stopListeningAndRequestSubmit();
      await flushPromises();
      await flushPromises();
    });

    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      await flushPromises();
    });

    expect(harness.getState().audioSessionState).toBe('idleReady');
    expect(harness.getState().lifecycle).toBe('idle');
    expect(harness.getState().transcribedText).toBe('');

    harness.unmount();
    fetchMock.mockRestore();
  });

  it('dedupes recoverable failures within one recording session', async () => {
    const onRecoverableFailure = jest.fn();
    const recorder = createEventRecorder();
    const harness = createHarness(recorder, { onRecoverableFailure });

    await act(async () => {
      await harness.actions.startListening(true);
      await flushPromises();
    });

    const voiceModule = Voice as unknown as {
      onSpeechError?: (e: { error?: { message?: string } }) => void;
    };
    act(() => {
      voiceModule.onSpeechError?.({ error: { message: 'no speech' } });
    });

    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 800));
      await flushPromises();
      await flushPromises();
    });

    expect(onRecoverableFailure).toHaveBeenCalledTimes(1);
    expect(onRecoverableFailure).toHaveBeenCalledWith(
      'speech_no_transcript',
      expect.objectContaining({
        telemetryReason: 'speechNoTranscript',
      }),
    );

    harness.unmount();
  });

  it('classifies remote capture stop failures as local capture failures, not proxy failures', async () => {
    mockGetSttProvider.mockReturnValue('remote');
    mockRecorderStop.mockRejectedValueOnce(new Error('recorder stop exploded'));
    mockRecorderUri = '';
    const onRecoverableFailure = jest.fn();
    const onError = jest.fn();
    const recorder = createEventRecorder();
    const harness = createHarness(recorder, {
      onRecoverableFailure,
      onError,
    });

    await act(async () => {
      await harness.actions.startListening(true);
      await flushPromises();
      await new Promise<void>(resolve => setTimeout(resolve, 50));
      await flushPromises();
    });

    await act(async () => {
      await harness.actions.stopListeningAndRequestSubmit();
      await flushPromises();
      await new Promise<void>(resolve => setTimeout(resolve, 50));
      await flushPromises();
    });

    expect(onRecoverableFailure).toHaveBeenCalledTimes(1);
    expect(onRecoverableFailure).toHaveBeenCalledWith(
      'speech_no_transcript',
      expect.objectContaining({
        telemetryReason: 'speechCapture',
        captureFailureKind: 'stopFailed',
        recordingSessionId: 'rec-1',
      }),
    );
    expect(onError).not.toHaveBeenCalledWith(
      'sttProxyFailed',
      expect.anything(),
    );
    expect(harness.getState().audioSessionState).toBe('idleReady');
    expect(harness.getState().lifecycle).toBe('idle');

    harness.unmount();
  });

  it('semantic front door abstain_transcript: scripted restate_request, TTS, no recoverable overlay', async () => {
    jest
      .spyOn(scriptedResponses, 'pickRandomResponse')
      .mockImplementation(list => list[0] ?? '');
    const onRecoverableFailure = jest.fn();
    const recorder = createEventRecorder();
    const harness = createHarness(recorder, { onRecoverableFailure });
    (rag.ask as jest.Mock).mockResolvedValueOnce({
      nudged: '',
      raw: '',
      validationSummary: {
        cards: [],
        rules: [],
        stats: {
          cardHitRate: 0,
          ruleHitRate: 0,
          unknownCardCount: 0,
          invalidRuleCount: 0,
        },
      },
      frontDoorBlocked: true,
      semanticFrontDoor: {
        contract_version: 7,
        working_query: 'x',
        resolver_mode: 'none',
        transcript_decision: 'insufficient_signal',
        front_door_verdict: 'abstain_transcript',
        failure_intent: 'restate_request',
        routing_readiness: { sections_selected: [] },
      },
    });

    await emitFinalTranscript(harness, 'Hello there');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
    });

    expect(harness.getState().lifecycle).toBe('idle');
    expect(harness.getState().responseText).toBe(RESTATES_REQUEST_RESPONSES[0] ?? null);
    expect(harness.getState().validationSummary).toBeNull();
    expect(harness.getState().lastFrontDoorOutcome?.semanticFrontDoor.front_door_verdict).toBe(
      'abstain_transcript',
    );
    expect(recorder.events.some(event => event.type === 'tts_start')).toBe(true);
    expect(onRecoverableFailure).not.toHaveBeenCalled();
    jest.restoreAllMocks();

    harness.unmount();
  });

  it('semantic front door clarify_entity: scripted ambiguous_entity + TTS + lastFrontDoorOutcome', async () => {
    jest
      .spyOn(scriptedResponses, 'pickRandomResponse')
      .mockImplementation(list => list[0] ?? '');
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);
    (rag.ask as jest.Mock).mockResolvedValueOnce({
      nudged: '',
      raw: '',
      validationSummary: {
        cards: [],
        rules: [],
        stats: {
          cardHitRate: 0,
          ruleHitRate: 0,
          unknownCardCount: 0,
          invalidRuleCount: 0,
        },
      },
      frontDoorBlocked: true,
      semanticFrontDoor: {
        contract_version: 7,
        working_query: 'bolt',
        resolver_mode: 'ambiguous',
        transcript_decision: 'pass_through',
        front_door_verdict: 'clarify_entity',
        failure_intent: 'ambiguous_entity',
        ambiguous_candidates: [{ name: 'Lightning Bolt' }, { name: 'Bolt Bend' }],
        routing_readiness: { sections_selected: [] },
      },
    });

    await emitFinalTranscript(harness, 'bolt');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
    });

    expect(harness.getState().responseText).toBe(AMBIGUOUS_ENTITY_RESPONSES[0] ?? null);
    expect(harness.getState().validationSummary).toBeNull();
    expect(harness.getState().lastFrontDoorOutcome?.semanticFrontDoor.front_door_verdict).toBe(
      'clarify_entity',
    );
    expect(recorder.events.some(event => event.type === 'tts_start')).toBe(true);
    jest.restoreAllMocks();

    harness.unmount();
  });

  it('successful completion clears lastFrontDoorOutcome after prior front door', async () => {
    jest
      .spyOn(scriptedResponses, 'pickRandomResponse')
      .mockImplementation(list => list[0] ?? '');
    const recorder = createEventRecorder();
    const harness = createHarness(recorder);
    (rag.ask as jest.Mock)
      .mockResolvedValueOnce({
        nudged: '',
        raw: '',
        validationSummary: {
          cards: [],
          rules: [],
          stats: {
            cardHitRate: 0,
            ruleHitRate: 0,
            unknownCardCount: 0,
            invalidRuleCount: 0,
          },
        },
        frontDoorBlocked: true,
        semanticFrontDoor: {
          contract_version: 7,
          working_query: 'x',
          resolver_mode: 'none',
          transcript_decision: 'insufficient_signal',
          front_door_verdict: 'abstain_transcript',
          failure_intent: 'restate_request',
          routing_readiness: { sections_selected: [] },
        },
      })
      .mockResolvedValueOnce(mockAskResult());

    await emitFinalTranscript(harness, 'first');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
    });
    expect(harness.getState().lastFrontDoorOutcome).not.toBeNull();

    await emitFinalTranscript(harness, 'Hello there second');

    await act(async () => {
      await harness.actions.submit();
      await flushPromises();
      await flushPromises();
    });

    expect(harness.getState().lastFrontDoorOutcome).toBeNull();
    expect(harness.getState().responseText).toBe('Hello there');

    await act(async () => {
      await flushPromises();
      await new Promise<void>(resolve => setTimeout(resolve, 30));
      await flushPromises();
    });

    jest.restoreAllMocks();
    harness.unmount();
  });
});
