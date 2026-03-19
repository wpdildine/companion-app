import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSttAudioCapture } from './useSttAudioCapture';

const mockPrepareToRecordAsync = jest.fn(() => Promise.resolve());
const mockRecord = jest.fn();
const mockStop = jest.fn(() => Promise.resolve());
const mockRequestRecordingPermissionsAsync = jest.fn(() =>
  Promise.resolve({ granted: true, status: 'granted' }),
);
const mockSetAudioModeAsync = jest.fn((_args?: unknown) => Promise.resolve());
const mockBase64 = jest.fn((_arg?: unknown) => Promise.resolve('YmFzZTY0'));
const mockCopy = jest.fn();
const mockFileCreate = jest.fn();
const mockFileWrite = jest.fn();
const mockDirectoryCreate = jest.fn();
const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1234567890);
const testGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };

jest.mock('expo-audio', () => ({
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: mockPrepareToRecordAsync,
    record: mockRecord,
    stop: mockStop,
    uri: 'file:///tmp/sample-recording.m4a',
  })),
  requestRecordingPermissionsAsync: () => mockRequestRecordingPermissionsAsync(),
  RecordingPresets: {
    HIGH_QUALITY: {},
  },
  setAudioModeAsync: (args: unknown) => mockSetAudioModeAsync(args),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn((...args: unknown[]) => {
    const lastArg = args[args.length - 1];
    const uri =
      typeof lastArg === 'string'
        ? `file:///mock/${lastArg}`
        : 'file:///tmp/sample-recording.m4a';
    return {
      uri,
      base64: (base64Arg?: unknown) => mockBase64(base64Arg),
      copy: (copyArg?: unknown) => mockCopy(copyArg),
      create: (createArg?: unknown) => mockFileCreate(createArg),
      write: (data?: unknown, options?: unknown) => mockFileWrite(data, options),
    };
  }),
  Directory: jest.fn(() => ({
    create: (arg?: unknown) => mockDirectoryCreate(arg),
  })),
  Paths: {
    document: {
      uri: 'file:///documents',
    },
  },
  EncodingType: {
    Base64: 'base64',
  },
}));

let hookResult: ReturnType<typeof useSttAudioCapture> | null = null;
let root: TestRenderer.ReactTestRenderer | null = null;
const originalDev = testGlobal.__DEV__;

function Harness() {
  hookResult = useSttAudioCapture();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  hookResult = null;
  root = null;
  testGlobal.__DEV__ = true;
});

afterEach(() => {
  testGlobal.__DEV__ = originalDev;
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
});

afterAll(() => {
  dateNowSpy.mockRestore();
});

function renderHarness() {
  act(() => {
    root = TestRenderer.create(React.createElement(Harness));
  });
}

describe('useSttAudioCapture', () => {
  it('captures audio and returns a base64 payload', async () => {
    renderHarness();

    await act(async () => {
      const started = await hookResult!.beginCapture('rec-1');
      expect(started).toBe(true);
    });

    expect(mockPrepareToRecordAsync).toHaveBeenCalled();
    expect(mockRecord).toHaveBeenCalled();

    let result: Awaited<
      ReturnType<ReturnType<typeof useSttAudioCapture>['endCapture']>
    > | undefined;

    await act(async () => {
      result = await hookResult!.endCapture('rec-1');
    });

    expect(mockStop).toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      capture: {
        audioBase64: 'YmFzZTY0',
        mimeType: 'audio/mp4',
        filename: 'sample-recording.m4a',
        debugPreservedUri:
          'file:///mock/file:///documents/debug-stt-captures/sample-recording-rec-1-1234567890.m4a',
      },
    });
    expect(mockDirectoryCreate).toHaveBeenCalledWith({ idempotent: true, intermediates: true });
    expect(mockFileCreate).toHaveBeenCalledWith({ overwrite: true, intermediates: true });
    expect(mockFileWrite).toHaveBeenCalledWith('YmFzZTY0', { encoding: 'base64' });
  });

  it('returns false when recording permission is denied', async () => {
    mockRequestRecordingPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      status: 'denied',
    });
    renderHarness();

    let started: boolean | undefined;
    await act(async () => {
      started = await hookResult!.beginCapture('rec-2');
    });

    expect(started).toBe(false);
    expect(mockPrepareToRecordAsync).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockSetAudioModeAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ allowsRecording: true }),
    );
  });
});
