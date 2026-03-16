/**
 * useOpenAIProxy: URL construction, env-missing fail-fast, success normalization,
 * non-OK and missing-text error handling. No real network.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useOpenAIProxy } from './useOpenAIProxy';

const mockGetEndpointBaseUrl = jest.fn();
jest.mock('../../../shared/config/endpointConfig', () => ({
  getEndpointBaseUrl: () => mockGetEndpointBaseUrl(),
}));

let fetchMock: jest.SpyInstance;
let hookResult: ReturnType<typeof useOpenAIProxy> | null = null;
let root: TestRenderer.ReactTestRenderer | null = null;

function Harness() {
  const result = useOpenAIProxy();
  hookResult = result;
  return null;
}

function renderHarness() {
  hookResult = null;
  act(() => {
    root = TestRenderer.create(React.createElement(Harness));
  });
  return root!;
}

beforeEach(() => {
  jest.clearAllMocks();
  hookResult = null;
  root = null;
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({}),
  } as Response);
});

afterEach(() => {
  if (root) {
    act(() => {
      root.unmount();
    });
  }
  fetchMock.mockRestore();
});

describe('useOpenAIProxy', () => {
  describe('URL construction from ENDPOINT_BASE_URL', () => {
    it('calls fetch with exactly ${base}/api/stt for transcribeAudio', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'transcribed' }),
      } as Response);
      renderHarness();
      await act(async () => {
        await hookResult!.transcribeAudio({
          audioBase64: 'base64audio',
        });
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://proxy.example.com/api/stt',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('calls fetch with exactly ${base}/api/respond for respond', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Hello from model' }),
      } as Response);
      renderHarness();
      await act(async () => {
        await hookResult!.respond({ prompt: 'Hi' });
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://proxy.example.com/api/respond',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('builds URL with no double slash when base has no trailing slash', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'ok' }),
      } as Response);
      renderHarness();
      await act(async () => {
        await hookResult!.transcribeAudio({ audioBase64: 'x' });
      });
      expect(fetchMock).toHaveBeenCalledWith('https://proxy.example.com/api/stt', expect.any(Object));
    });

    it('trims a trailing slash from the base URL before joining the path', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com/');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'ok' }),
      } as Response);
      renderHarness();
      await act(async () => {
        await hookResult!.transcribeAudio({ audioBase64: 'x' });
      });
      expect(fetchMock).toHaveBeenCalledWith('https://proxy.example.com/api/stt', expect.any(Object));
    });
  });

  describe('Env-missing failure case', () => {
    it('when getEndpointBaseUrl returns null, fails fast with readable error and no fetch is attempted', async () => {
      mockGetEndpointBaseUrl.mockReturnValue(null);
      renderHarness();
      await act(async () => {
        try {
          await hookResult!.transcribeAudio({ audioBase64: 'x' });
        } catch (e) {
          expect(e).toMatchObject({
            message: 'OpenAI proxy base URL not configured (ENDPOINT_BASE_URL)',
            code: 'E_BASE_URL',
          });
        }
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(hookResult!.lastError).toEqual({
        message: 'OpenAI proxy base URL not configured (ENDPOINT_BASE_URL)',
        code: 'E_BASE_URL',
      });
    });

    it('when getEndpointBaseUrl returns empty string, no fetch is attempted', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('');
      renderHarness();
      await act(async () => {
        try {
          await hookResult!.respond({ prompt: 'Hi' });
        } catch {
          // expected
        }
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Non-OK proxy response handling', () => {
    it('on 4xx sets lastError and throws normalized error without leaking raw body', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request body from OpenAI',
      } as Response);
      renderHarness();
      await act(async () => {
        try {
          await hookResult!.respond({ prompt: 'Hi' });
        } catch (e) {
          expect(e).toMatchObject({
            message: 'OpenAI proxy request failed: 400',
            code: 'E_PROXY',
          });
          expect((e as { message: string }).message).not.toContain('Bad request body');
        }
      });
      expect(hookResult!.lastError).toEqual({
        message: 'OpenAI proxy request failed: 400',
        code: 'E_PROXY',
      });
    });

    it('on 5xx sets lastError and throws', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 502,
      } as Response);
      renderHarness();
      await act(async () => {
        try {
          await hookResult!.transcribeAudio({ audioBase64: 'x' });
        } catch (e) {
          expect(e).toMatchObject({ message: 'OpenAI proxy request failed: 502', code: 'E_PROXY' });
        }
      });
      expect(hookResult!.lastError).toEqual({
        message: 'OpenAI proxy request failed: 502',
        code: 'E_PROXY',
      });
    });

    it('normalizes fetch failures to the transport error message', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockRejectedValueOnce(new Error('socket hang up'));
      renderHarness();
      await act(async () => {
        try {
          await hookResult!.respond({ prompt: 'Hi' });
        } catch (e) {
          expect(e).toEqual({
            message: 'OpenAI proxy request failed',
            code: 'E_NETWORK',
          });
        }
      });
      expect(hookResult!.lastError).toEqual({
        message: 'OpenAI proxy request failed',
        code: 'E_NETWORK',
      });
    });

    it('times out STT when fetch never resolves', async () => {
      jest.useFakeTimers();
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockImplementationOnce(
        () => new Promise(() => {}),
      );
      renderHarness();
      let error: unknown;
      await act(async () => {
        const promise = hookResult!.transcribeAudio({ audioBase64: 'x' }).catch(
          e => {
            error = e;
          },
        );
        await jest.advanceTimersByTimeAsync(4000);
        await promise;
      });
      expect(error).toEqual({
        message: 'STT request timed out',
        code: 'E_TIMEOUT',
      });
      expect(hookResult!.lastError).toEqual({
        message: 'STT request timed out',
        code: 'E_TIMEOUT',
      });
      jest.useRealTimers();
    });
  });

  describe('Missing text handling', () => {
    it('STT: accepts top-level { text: string, usage?: ... } and returns text as-is', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Top-level transcript', usage: { inputTokens: 0, outputTokens: 1 } }),
      } as Response);
      renderHarness();
      let result: { text: string } | undefined;
      await act(async () => {
        result = await hookResult!.transcribeAudio({ audioBase64: 'x' });
      });
      expect(result!.text).toBe('Top-level transcript');
      expect(hookResult!.lastError).toBeNull();
    });

    it('STT: accepts top-level text when empty or whitespace-only (caller treats as no usable transcript)', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: '   \n\t  ' }),
      } as Response);
      renderHarness();
      let result: { text: string } | undefined;
      await act(async () => {
        result = await hookResult!.transcribeAudio({ audioBase64: 'x' });
      });
      expect(result!.text).toBe('   \n\t  ');
      expect(hookResult!.lastError).toBeNull();
    });

    it('STT: accepts common nested proxy transcript shapes', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      const responses = [
        { transcript: 'Nested transcript' },
        { output_text: 'Output text transcript' },
        { data: { text: 'Data text transcript' } },
        { result: { transcript: 'Result transcript' } },
        { text: { value: 'Object value transcript' } },
        { text: [{ text: 'Array' }, { value: 'based transcript' }] },
        { choices: [{ text: 'Choice transcript' }] },
        { segments: [{ text: 'Joined' }, { text: 'segments' }] },
      ];

      renderHarness();

      for (const response of responses) {
        (fetchMock as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => response,
        } as Response);

        let result: { text: string } | undefined;
        await act(async () => {
          result = await hookResult!.transcribeAudio({ audioBase64: 'x' });
        });

        expect(result?.text.length).toBeGreaterThan(0);
        expect(hookResult!.lastError).toBeNull();
      }
    });

    it('STT: 200 with valid JSON but no usable text (empty object or non-string text) treats as error', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      const malformedResponses = [{}, { text: null }, { usage: 10 }];
      renderHarness();
      for (const response of malformedResponses) {
        (fetchMock as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => response,
        } as Response);
        await act(async () => {
          try {
            await hookResult!.transcribeAudio({ audioBase64: 'x' });
          } catch (e) {
            expect(e).toMatchObject({ message: 'STT transcription returned no text', code: 'E_NO_TEXT' });
          }
        });
        expect(hookResult!.lastError).toEqual({
          message: 'STT transcription returned no text',
          code: 'E_NO_TEXT',
        });
      }
    });

    it('respond: 200 with valid JSON but no assistant text treats as error', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] }),
      } as Response);
      renderHarness();
      await act(async () => {
        try {
          await hookResult!.respond({ prompt: 'Hi' });
        } catch (e) {
          expect(e).toMatchObject({ message: 'Respond request returned no assistant text', code: 'E_NO_TEXT' });
        }
      });
      expect(hookResult!.lastError).toEqual({
        message: 'Respond request returned no assistant text',
        code: 'E_NO_TEXT',
      });
    });

    it('malformed JSON is normalized without leaking parser details', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      } as Response);
      renderHarness();
      await act(async () => {
        try {
          await hookResult!.respond({ prompt: 'Hi' });
        } catch (e) {
          expect(e).toEqual({
            message: 'OpenAI proxy request failed',
            code: 'E_JSON',
          });
        }
      });
      expect(hookResult!.lastError).toEqual({
        message: 'OpenAI proxy request failed',
        code: 'E_JSON',
      });
    });
  });

  describe('Normalization of usage/model for respond', () => {
    it('returns RespondResult with text (required), model and usage when proxy returns normalized shape', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'Here is the answer.',
          model: 'gpt-4',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        }),
      } as Response);
      renderHarness();
      let result: { text: string; model?: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } } | undefined;
      await act(async () => {
        result = await hookResult!.respond({ prompt: 'Hi' });
      });
      expect(result).toBeDefined();
      expect(result!.text).toBe('Here is the answer.');
      expect(result!.model).toBe('gpt-4');
      expect(result!.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
      expect(hookResult!.lastError).toBeNull();
    });

    it('maps OpenAI chat.completions shape to RespondResult', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Assistant reply here.' } }],
          model: 'gpt-4o',
          usage: { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26 },
        }),
      } as Response);
      renderHarness();
      let result: { text: string; model?: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } } | undefined;
      await act(async () => {
        result = await hookResult!.respond({ prompt: 'Hi' });
      });
      expect(result).toBeDefined();
      expect(result!.text).toBe('Assistant reply here.');
      expect(result!.model).toBe('gpt-4o');
      expect(result!.usage).toEqual({ inputTokens: 20, outputTokens: 6, totalTokens: 26 });
    });
  });

  describe('Success normalization and lastError', () => {
    it('STT success clears lastError and returns SttResult with text', async () => {
      mockGetEndpointBaseUrl.mockReturnValue('https://proxy.example.com');
      (fetchMock as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
      } as Response);
      renderHarness();
      let result: { text: string } | undefined;
      await act(async () => {
        result = await hookResult!.transcribeAudio({ audioBase64: 'x' });
      });
      expect(result!.text).toBe('Hello world');
      expect(hookResult!.lastError).toBeNull();
    });
  });
});
