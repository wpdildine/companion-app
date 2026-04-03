/**
 * Cycle 3: vector/Ollama paths must not run retrieval before semantic front-door authorization.
 */

describe('runRagFlow pre-retrieval gate', () => {
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
              rules_rule_ids: { path: 'validate/rule_ids.json', format: 'json' },
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
        embed_model_id: 'test',
        dim: 768,
        metric: 'l2' as const,
        normalize: false,
      },
      chunksPath: 'rules/chunks.jsonl',
      vectorsPath: 'rules/vectors.bin',
      rowMapPath: 'rules/row_map.json',
    },
    cards: {
      indexMeta: {
        embed_model_id: 'test',
        dim: 768,
        metric: 'l2' as const,
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

  const reader = {
    readFile: async () => '',
    readFileBinary: async () => new ArrayBuffer(0),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns frontDoorBlocked and does not call fetch when gate blocks Ollama path', async () => {
    jest.doMock('../src/rag/types', () => {
      const actual = jest.requireActual('../src/rag/types');
      return { ...actual, RAG_USE_DETERMINISTIC_CONTEXT_ONLY: false };
    });
    jest.doMock('../src/rag/frontDoorGate', () => ({
      shouldRunFrontDoorGateBeforeRetrieval: () => true,
      checkFrontDoorBeforeRetrieval: jest.fn(() =>
        Promise.resolve({
          blocked: true,
          semanticFrontDoor: {
            contract_version: 1,
            working_query: 'q',
            resolver_mode: 'none',
            transcript_decision: 'pass_through',
            front_door_verdict: 'abstain_no_grounding',
            failure_intent: null,
            routing_readiness: { sections_selected: [] },
          },
        }),
      ),
    }));

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({ embedding: new Array(768).fill(0) }),
        } as Response),
      );

    const { runRagFlow } = require('../src/rag/ask');
    const result = await runRagFlow(
      packState,
      {
        embedModelId: 'x',
        embedModelPath: '/e.gguf',
        chatModelPath: '/c.gguf',
        packRoot: '/tmp/content_pack',
        ollamaHost: 'http://127.0.0.1:11434',
        ollamaEmbedModel: 'nomic-embed-text',
        ollamaChatModel: 'llama3.2',
      },
      reader,
      'Partner with Kraum',
    );

    expect(result.frontDoorBlocked).toBe(true);
    expect(result.raw).toBe('');
    expect(result.contextText).toBe('');
    expect(result.semanticFrontDoor?.front_door_verdict).toBe(
      'abstain_no_grounding',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('does not call fetch when gate blocks on-device vector path', async () => {
    jest.doMock('../src/rag/types', () => {
      const actual = jest.requireActual('../src/rag/types');
      return { ...actual, RAG_USE_DETERMINISTIC_CONTEXT_ONLY: false };
    });
    jest.doMock('../src/rag/frontDoorGate', () => ({
      shouldRunFrontDoorGateBeforeRetrieval: () => true,
      checkFrontDoorBeforeRetrieval: jest.fn(() =>
        Promise.resolve({
          blocked: true,
          semanticFrontDoor: {
            contract_version: 1,
            working_query: 'q',
            resolver_mode: 'none',
            transcript_decision: 'pass_through',
            front_door_verdict: 'abstain_transcript',
            failure_intent: 'restate_request',
            routing_readiness: { sections_selected: [] },
          },
        }),
      ),
    }));

    const fetchSpy = jest.spyOn(global, 'fetch');

    const { runRagFlow } = require('../src/rag/ask');
    const result = await runRagFlow(
      packState,
      {
        embedModelId: 'x',
        embedModelPath: '/embed.gguf',
        chatModelPath: '/chat.gguf',
        packRoot: '/tmp/content_pack',
      },
      reader,
      'uh',
    );

    expect(result.frontDoorBlocked).toBe(true);
    expect(result.raw).toBe('');
    expect(result.contextText).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
