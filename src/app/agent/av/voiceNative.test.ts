/**
 * Unit tests for voiceNative helpers (nontrivial logic only).
 */

import {
  errorMessage,
  isRecognizerReentrancyError,
  isRecoverableSpeechError,
  blockWindowUntil,
  NATIVE_RESTART_GUARD_MS,
} from './voiceNative';

describe('voiceNative helpers', () => {
  describe('errorMessage', () => {
    it('returns message for Error', () => {
      expect(errorMessage(new Error('foo'))).toBe('foo');
    });
    it('returns string for object with message', () => {
      expect(errorMessage({ message: 'bar' })).toBe('bar');
    });
    it('returns String(e) for primitive', () => {
      expect(errorMessage(42)).toBe('42');
    });
  });

  describe('isRecognizerReentrancyError', () => {
    it('returns true when message includes "already started"', () => {
      expect(isRecognizerReentrancyError('already started')).toBe(true);
      expect(isRecognizerReentrancyError('Error: already started')).toBe(true);
    });
    it('returns false otherwise', () => {
      expect(isRecognizerReentrancyError('no match')).toBe(false);
    });
  });

  describe('isRecoverableSpeechError', () => {
    it('returns true for no match, no speech, 7/, 11/', () => {
      expect(isRecoverableSpeechError('no match')).toBe(true);
      expect(isRecoverableSpeechError("didn't understand")).toBe(true);
      expect(isRecoverableSpeechError('no speech')).toBe(true);
      expect(isRecoverableSpeechError('7/')).toBe(true);
      expect(isRecoverableSpeechError('11/')).toBe(true);
    });
    it('returns false for other messages', () => {
      expect(isRecoverableSpeechError('network error')).toBe(false);
    });
  });

  describe('blockWindowUntil', () => {
    it('returns now + NATIVE_RESTART_GUARD_MS', () => {
      const now = 1000;
      expect(blockWindowUntil(now)).toBe(now + NATIVE_RESTART_GUARD_MS);
    });
  });
});
