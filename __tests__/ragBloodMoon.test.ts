describe('RAG Blood Moon settlement payload', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('sanitizes leaked prompt text and keeps selected cards and rules available', async () => {
    const packState = {
      packRoot: '/tmp/content_pack',
      manifest: {
        pack_schema_version: 1,
        sidecars: {
          schema_version: 1,
          capabilities: {
            validate: {
              schema_version: 1,
              files: {
                rules_rule_ids: {
                  path: 'validate/rule_ids.json',
                  format: 'json',
                },
                cards_name_lookup: {
                  path: 'validate/name_lookup.jsonl',
                  format: 'jsonl',
                },
              },
            },
          },
        },
      },
      rules: {
        indexMeta: {
          embed_model_id: 'deterministic',
          dim: 1,
          metric: 'l2',
          normalize: false,
        },
        chunksPath: 'rules/chunks.jsonl',
        vectorsPath: 'rules/vectors.bin',
        rowMapPath: 'rules/row_map.json',
      },
      cards: {
        indexMeta: {
          embed_model_id: 'deterministic',
          dim: 1,
          metric: 'l2',
          normalize: false,
        },
        chunksPath: 'cards/chunks.jsonl',
        vectorsPath: 'cards/vectors.bin',
        rowMapPath: 'cards/row_map.json',
      },
      validate: {
        rulesRuleIdsPath: 'validate/rule_ids.json',
        cardsNameLookupPath: 'validate/name_lookup.jsonl',
      },
    };

    jest.doMock('@atlas/runtime', () => ({
      runHumanShortPipeline: jest.fn((text: string) => text),
      runPipelineHumanShort: jest.fn((text: string) => ({ finalText: text })),
    }));

    jest.doMock('../src/rag/loadPack', () => ({
      loadPack: jest.fn(async () => packState),
    }));

    jest.doMock('../src/rag/ask', () => ({
      runRagFlow: jest.fn(async () => ({
        raw: 'Flesh // Blood Moon has a different effect than a basic land.\n"[Card: Blood Moon]\nNonbasic lands are Mountains."\nFlesh // Blood Moon is a basic land.',
        contextText:
          '[Card: Blood Moon]\nNonbasic lands are Mountains.\n\n[Rule 305.7]\nIf an effect sets a land’s subtype to one or more of the basic land types, the land has no land type other than the new one.',
        intent: 'unknown',
        contextSelection: {
          cards: [
            {
              name: 'Blood Moon',
              doc_id: 'oracle:blood-moon',
              oracleText: 'Nonbasic lands are Mountains.',
            },
          ],
          rules: [{ rule_id: '305.7' }],
        },
      })),
    }));

    jest.doMock('../src/rag/validate', () => ({
      nudgeResponse: jest.fn(async () => ({
        nudgedText:
          'Flesh // Blood Moon has a different effect than a basic land.\n"[Card: Blood Moon]\nNonbasic lands are Mountains."\nFlesh // Blood Moon is a basic land.',
        summary: {
          cards: [
            {
              raw: 'blood moon',
              canonical: 'Blood Moon',
              doc_id: 'oracle:blood-moon',
              oracleText: undefined,
              status: 'in_pack',
            },
          ],
          rules: [],
          stats: {
            cardHitRate: 1,
            ruleHitRate: 1,
            unknownCardCount: 0,
            invalidRuleCount: 0,
          },
        },
      })),
    }));

    const rag = require('../src/rag') as typeof import('../src/rag');
    const reader = {
      readFile: jest.fn(async () => ''),
      readFileBinary: jest.fn(async () => new ArrayBuffer(0)),
    };

    await rag.init(
      {
        embedModelId: 'deterministic',
        embedModelPath: '',
        chatModelPath: '/tmp/model.gguf',
        packRoot: '/tmp/content_pack',
      },
      reader,
    );

    const result = await rag.ask('What does blood moon do?');

    expect(result.nudged).toBe(
      'Blood Moon turns nonbasic lands into Mountains.',
    );
    expect(result.validationSummary.cards).toEqual([
      expect.objectContaining({
        canonical: 'Blood Moon',
        doc_id: 'oracle:blood-moon',
        oracleText: 'Nonbasic lands are Mountains.',
        status: 'in_pack',
      }),
    ]);
    expect(result.validationSummary.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          raw: '305.7',
          canonical: '305.7',
          status: 'valid',
        }),
      ]),
    );
  });
});
