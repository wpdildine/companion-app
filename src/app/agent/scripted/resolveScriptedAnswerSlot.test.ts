import { resolveScriptedAnswerSlot } from './resolveScriptedAnswerSlot';
import {
  SCRIPTED_CLARIFY_ENTITY_PREFIX,
  SCRIPTED_EMPTY_OUTPUT_MESSAGE,
} from './v1Copy';

describe('resolveScriptedAnswerSlot', () => {
  describe('front_door', () => {
    it('returns null for abstain', () => {
      expect(
        resolveScriptedAnswerSlot({
          path: 'front_door',
          kind: 'abstain',
          draftText: '',
        }),
      ).toBeNull();
    });

    it('returns null for clarify with empty draft', () => {
      expect(
        resolveScriptedAnswerSlot({
          path: 'front_door',
          kind: 'clarify',
          draftText: '   ',
        }),
      ).toBeNull();
    });

    it('augments clarify draft with presentation prefix', () => {
      expect(
        resolveScriptedAnswerSlot({
          path: 'front_door',
          kind: 'clarify',
          draftText: 'A\nB',
        }),
      ).toBe(`${SCRIPTED_CLARIFY_ENTITY_PREFIX}A\nB`);
    });
  });

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
  });
});
