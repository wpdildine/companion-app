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
            norm_promotion: 'lexical',
            aliases_promotion: [],
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

  it('does not promote collision-prone split-card aliases from ordinary prose', async () => {
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
          return [
            JSON.stringify({
              doc_id: 'oracle:wwwww',
              name: 'Who // What // When // Where // Why',
              norm: 'who what when where why',
              aliases_norm: ['what', 'when', 'where'],
              norm_promotion: 'lexical',
              aliases_promotion: [
                'requires_strong_confirmation',
                'requires_strong_confirmation',
                'requires_strong_confirmation',
              ],
            }),
            JSON.stringify({
              doc_id: 'oracle:blood-moon',
              name: 'Blood Moon',
              norm: 'blood moon',
              aliases_norm: [],
              norm_promotion: 'lexical',
              aliases_promotion: [],
            }),
          ].join('\n');
        }
        return '';
      }),
      readFileBinary: jest.fn(),
    };

    const result = await nudgeResponse(
      'Blood Moon turns nonbasics into Mountains; what matters is the continuous effect.',
      packState,
      reader as unknown as import('../src/rag').PackFileReader,
    );

    expect(result.summary.cards.map((c) => c.canonical)).not.toContain('Who // What // When // Where // Why');
    expect(result.summary.cards.some((c) => c.canonical === 'Blood Moon')).toBe(true);
    expect(result.nudgedText).not.toMatch(/\/\//);
  });
});
