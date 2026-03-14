/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    volume: 1,
    loop: false,
    playing: false,
    isLoaded: true,
    play: jest.fn(() => Promise.resolve()),
    seekTo: jest.fn(() => Promise.resolve()),
    release: jest.fn(),
  })),
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
  File: jest.fn(() => ({
    base64: jest.fn(() => Promise.resolve('')),
  })),
}));

jest.mock('../src/shared/feedback/earcons', () => ({
  prepareEarcons: jest.fn(() => Promise.resolve()),
  playListeningStartEarcon: jest.fn(),
  playListeningEndEarcon: jest.fn(),
  cleanupEarcons: jest.fn(),
}));

jest.mock('@react-three/fiber/native', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

jest.mock('expo-gl', () => ({}));

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
