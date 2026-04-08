import { resolveScriptedAnswerSlot } from './resolveScriptedAnswerSlot';
import * as scriptedResponses from './scriptedResponses';
import { SCRIPTED_EMPTY_OUTPUT_MESSAGE } from './v1Copy';

describe('resolveScriptedAnswerSlot', () => {
  describe('settle', () => {
    it('returns canonical empty message when nudged is blank', () => {
      expect(
        resolveScriptedAnswerSlot({ path: 'settle', nudgedRaw: '' }),
      ).toBe(SCRIPTED_EMPTY_OUTPUT_MESSAGE);
      expect(
        resolveScriptedAnswerSlot({ path: 'settle', nudgedRaw: '  \n' }),
      ).toBe(SCRIPTED_EMPTY_OUTPUT_MESSAGE);
    });

    it('returns raw nudged when non-empty', () => {
      expect(
        resolveScriptedAnswerSlot({ path: 'settle', nudgedRaw: 'Hello' }),
      ).toBe('Hello');
    });

    it('replaces insufficient_context with scripted line (runtime failureIntent)', () => {
      jest.spyOn(scriptedResponses, 'pickRandomResponse').mockReturnValue('SCRIPTED_INSUFFICIENT');
      expect(
        resolveScriptedAnswerSlot({
          path: 'settle',
          nudgedRaw: 'Insufficient retrieved context.',
          failureIntent: 'insufficient_context',
        }),
      ).toBe('SCRIPTED_INSUFFICIENT');
      jest.restoreAllMocks();
    });
  });
});
