/**
 * Unit tests for request pipeline runner: stale handling, partial throttling,
 * empty fallback, terminal failure, playback vs completion handoff.
 */

import {
  executeRequest,
  PARTIAL_EMIT_THROTTLE_MS,
  RESPONSE_TEXT_UPDATE_THROTTLE_MS,
  EMPTY_RESPONSE_FALLBACK_MESSAGE,
  type ExecuteRequestOptions,
  type Ref,
} from './executeRequest';
import type { ValidationSummary } from '../../../rag';
import { CONTEXT_RETRIEVAL_EMPTY } from '../../../rag/errors';

jest.mock('../../../rag', () => {
  const actual = jest.requireActual<typeof import('../../../rag')>('../../../rag');
  return {
    ...actual,
    getPackState: () => true,
    ask: jest.fn(),
  };
});

const emptyValidationSummary: ValidationSummary = {
  cards: [],
  rules: [],
  stats: {
    cardHitRate: 0,
    ruleHitRate: 0,
    unknownCardCount: 0,
    invalidRuleCount: 0,
  },
};

function makeBaseOptions(overrides: Partial<ExecuteRequestOptions> = {}): ExecuteRequestOptions {
  const activeRequestIdRef: Ref<number> = { current: 1 };
  const setResponseText = jest.fn();
  const setValidationSummary = jest.fn();
  const setProcessingSubstate = jest.fn();
  const requestDebugSink = jest.fn();
  const previousCommittedResponseRef: Ref<string | null> = { current: null };
  const previousCommittedValidationRef: Ref<ValidationSummary | null> = { current: null };

  return {
    requestId: 1,
    question: 'test',
    requestDebugSink,
    activeRequestIdRef,
    setResponseText,
    setValidationSummary,
    setProcessingSubstate,
    listenersRef: { current: null },
    getPackState: () => true,
    copyBundlePackToDocuments: jest.fn().mockResolvedValue(''),
    getContentPackPathInDocuments: jest.fn().mockResolvedValue(null),
    createDocumentsPackReader: jest.fn(),
    createBundlePackReader: jest.fn(),
    createThrowReader: jest.fn(),
    getPackEmbedModelId: jest.fn().mockResolvedValue('embed-id'),
    getOnDeviceModelPaths: jest.fn().mockResolvedValue({ embedModelPath: '', chatModelPath: '' }),
    previousCommittedResponseRef,
    previousCommittedValidationRef,
    ...overrides,
  };
}

function getMockRagAsk(): jest.Mock {
  return require('../../../rag').ask as jest.Mock;
}

describe('executeRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports expected constants', () => {
    expect(PARTIAL_EMIT_THROTTLE_MS).toBe(400);
    expect(RESPONSE_TEXT_UPDATE_THROTTLE_MS).toBe(150);
    expect(EMPTY_RESPONSE_FALLBACK_MESSAGE).toBe('No answer generated');
  });

  describe('stale-request handling', () => {
    it('returns status stale when activeRequestIdRef changes before ragAsk resolves', async () => {
      const options = makeBaseOptions();
      let resolveAsk: (v: { nudged: string; raw: string; validationSummary: ValidationSummary }) => void = () => {};
      getMockRagAsk().mockImplementation(
        () =>
          new Promise(resolve => {
            resolveAsk = resolve;
          })
      );

      const resultPromise = executeRequest(options);
      options.activeRequestIdRef.current = 99;
      resolveAsk({
        nudged: 'would be committed',
        raw: 'would be committed',
        validationSummary: emptyValidationSummary,
      });

      const result = await resultPromise;
      expect(result).toEqual({ status: 'stale' });
      expect(options.setResponseText).not.toHaveBeenCalledWith('would be committed');
    });
  });

  describe('semantic front door', () => {
    it('returns status front_door when ragAsk blocks at substrate gate', async () => {
      getMockRagAsk().mockResolvedValue({
        nudged: '',
        raw: '',
        validationSummary: emptyValidationSummary,
        frontDoorBlocked: true,
        semanticFrontDoor: {
          contract_version: 1,
          working_query: 'x',
          resolver_mode: 'none',
          transcript_decision: 'insufficient_signal',
          front_door_verdict: 'abstain_transcript',
          routing_readiness: { sections_selected: [] },
        },
      });

      const options = makeBaseOptions();
      const result = await executeRequest(options);

      expect(result).toMatchObject({
        status: 'front_door',
        semanticFrontDoor: expect.objectContaining({
          front_door_verdict: 'abstain_transcript',
        }),
      });
      expect(options.requestDebugSink).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'semantic_front_door' }),
      );
      expect(options.setResponseText).not.toHaveBeenCalled();
      expect(options.setValidationSummary).not.toHaveBeenCalled();
    });
  });

  describe('empty-output fallback', () => {
    it('returns completed with EMPTY_RESPONSE_FALLBACK_MESSAGE and shouldPlay false when nudged is empty', async () => {
      getMockRagAsk().mockResolvedValue({
        nudged: '  \n\t  ',
        raw: '',
        validationSummary: emptyValidationSummary,
      });

      const options = makeBaseOptions();
      const result = await executeRequest(options);

      expect(result).toMatchObject({
        status: 'completed',
        committedText: EMPTY_RESPONSE_FALLBACK_MESSAGE,
        shouldPlay: false,
      });
      expect(options.setResponseText).toHaveBeenCalledWith(EMPTY_RESPONSE_FALLBACK_MESSAGE);
    });
  });

  describe('terminal-failure path', () => {
    it('returns status failed with classification and displayMessage when ragAsk throws', async () => {
      const err = Object.assign(new Error('model path missing'), { code: 'E_MODEL_PATH' });
      getMockRagAsk().mockRejectedValue(err);

      const options = makeBaseOptions();
      options.previousCommittedResponseRef.current = 'previous';
      options.previousCommittedValidationRef.current = emptyValidationSummary;

      const result = await executeRequest(options);

      expect(result).toMatchObject({
        status: 'failed',
        classification: expect.objectContaining({
          kind: 'model_unavailable',
          stage: 'model',
          recoverability: 'terminal',
        }),
        displayMessage: expect.any(String),
      });
      expect((result as { status: 'failed'; displayMessage: string }).displayMessage).toContain(
        'E_MODEL_PATH'
      );
    });

    it('includes attributionErrorKind on request_failed when RAG error carries structured attribution', async () => {
      const err = {
        code: 'E_RETRIEVAL',
        message: 'Deterministic context provider returned empty bundle.',
        details: {
          attribution: { error_kind: CONTEXT_RETRIEVAL_EMPTY },
        },
      };
      getMockRagAsk().mockRejectedValue(err);

      const options = makeBaseOptions();
      const result = await executeRequest(options);

      expect(result).toMatchObject({
        status: 'failed',
        classification: expect.objectContaining({
          kind: 'retrieval_empty_bundle',
        }),
      });
      expect(options.requestDebugSink).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'request_failed',
          attributionErrorKind: CONTEXT_RETRIEVAL_EMPTY,
        }),
      );
    });
  });

  describe('playback vs completion handoff', () => {
    it('returns shouldPlay true when nudged has content', async () => {
      getMockRagAsk().mockResolvedValue({
        nudged: 'Hello world',
        raw: 'Hello world',
        validationSummary: emptyValidationSummary,
      });

      const options = makeBaseOptions();
      const result = await executeRequest(options);

      expect(result).toMatchObject({
        status: 'completed',
        committedText: 'Hello world',
        shouldPlay: true,
      });
    });

    it('returns shouldPlay false when nudged is empty (fallback message only)', async () => {
      getMockRagAsk().mockResolvedValue({
        nudged: '',
        raw: '',
        validationSummary: emptyValidationSummary,
      });

      const options = makeBaseOptions();
      const result = await executeRequest(options);

      expect(result).toMatchObject({
        status: 'completed',
        committedText: EMPTY_RESPONSE_FALLBACK_MESSAGE,
        shouldPlay: false,
      });
    });
  });

  describe('partial-output throttling', () => {
    it('emits partial_output to requestDebugSink at most once per PARTIAL_EMIT_THROTTLE_MS when onPartial is called multiple times synchronously', async () => {
      let capturedOnPartial: ((text: string) => void) | undefined;
      getMockRagAsk().mockImplementation((_q: string, opts: { onPartial?: (t: string) => void }) => {
        capturedOnPartial = opts.onPartial;
        return Promise.resolve({
          nudged: 'abc',
          raw: 'abc',
          validationSummary: emptyValidationSummary,
        });
      });

      const options = makeBaseOptions();
      const resultPromise = executeRequest(options);

      await Promise.resolve();
      if (capturedOnPartial) {
        capturedOnPartial('a');
        capturedOnPartial('ab');
        capturedOnPartial('abc');
      }

      const result = await resultPromise;
      expect(result.status).toBe('completed');

      const partialEmits = (options.requestDebugSink as jest.Mock).mock.calls.filter(
        (c: { type: string }[]) => c[0]?.type === 'partial_output'
      );
      expect(partialEmits.length).toBeLessThanOrEqual(2);
    });

    it('emits more partial_output when onPartial is called with gaps >= PARTIAL_EMIT_THROTTLE_MS', async () => {
      jest.useFakeTimers();
      let capturedOnPartial: ((text: string) => void) | undefined;
      getMockRagAsk().mockImplementation((_q: string, opts: { onPartial?: (t: string) => void }) => {
        capturedOnPartial = opts.onPartial;
        setTimeout(() => {
          if (capturedOnPartial) {
            capturedOnPartial('a');
            jest.advanceTimersByTime(PARTIAL_EMIT_THROTTLE_MS + 10);
            capturedOnPartial('ab');
            jest.advanceTimersByTime(PARTIAL_EMIT_THROTTLE_MS + 10);
            capturedOnPartial('abc');
          }
        }, 0);
        return Promise.resolve({
          nudged: 'abc',
          raw: 'abc',
          validationSummary: emptyValidationSummary,
        });
      });

      const options = makeBaseOptions();
      const resultPromise = executeRequest(options);
      await jest.runAllTimersAsync();
      const result = await resultPromise;
      jest.useRealTimers();

      expect(result.status).toBe('completed');
      const partialEmits = (options.requestDebugSink as jest.Mock).mock.calls.filter(
        (c: { type: string }[]) => c[0]?.type === 'partial_output'
      );
      expect(partialEmits.length).toBeGreaterThanOrEqual(1);
    });
  });
});
