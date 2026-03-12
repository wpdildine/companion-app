describe('RAG validation summary', () => {
  it('does not surface unknown free-text words as card references', async () => {
    const { nudgeResponse } = require('../src/rag/validate') as typeof import('../src/rag/validate');

    const packState = {
      validate: {
        rulesRuleIdsPath: 'validate/rule_ids.json',
        cardsNameLookupPath: 'validate/name_lookup.jsonl',
      },
    } as import('../src/rag').PackState;

    const reader = {
      readFile: jest.fn(async (path: string) => {
        if (path === 'validate/rule_ids.json') {
          return JSON.stringify({ rule_ids: ['305.7'] });
        }
        if (path === 'validate/name_lookup.jsonl') {
          return JSON.stringify({
            doc_id: 'oracle:blood-moon',
            name: 'Blood Moon',
            norm: 'blood moon',
            aliases_norm: [],
          });
        }
        return '';
      }),
      readFileBinary: jest.fn(),
    };

    const result = await nudgeResponse(
      'Blood Moon has a different effect than a basic land.',
      packState,
      reader as unknown as import('../src/rag').PackFileReader,
    );

    expect(result.summary.cards).toEqual([
      expect.objectContaining({
        canonical: 'Blood Moon',
        status: 'in_pack',
      }),
    ]);
    expect(result.summary.stats.unknownCardCount).toBeGreaterThan(0);
  });
});
