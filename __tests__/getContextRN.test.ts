describe('getContextRN land-type rule hydration', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('adds rule 305.7 for basic-land-type changing cards like Blood Moon', async () => {
    jest.doMock('@atlas/runtime', () => ({
      preNormalizeTranscriptForQuery: jest.fn((q: string) => ({
        workingQuery: q.trim(),
        uncertainty: {
          schema_version: 1,
          raw_query: q,
          working_query: q.trim(),
          detected_corruption_classes: [],
          recovery_steps_applied: [],
          transcript_decision: 'pass_through',
        },
      })),
      normalizeForEntityCatalogKey: jest.fn((s: string) => s.toLowerCase().trim()),
      computeSemanticFrontDoor: jest.fn((input: { working_query: string }) => ({
        contract_version: 1,
        working_query: input.working_query,
        resolver_mode: 'resolved',
        transcript_decision: 'pass_through',
        front_door_verdict: 'proceed_to_retrieval',
        failure_intent: null,
        routing_readiness: { sections_selected: [] },
      })),
      analyzeQuery: jest.fn(() => ({
        q_norm: 'what does blood moon do',
        what_does_name_norm: 'blood moon',
        looks_like_card_query: true,
        looks_like_card_reason: 'what_does',
        tokens_norm: [],
        concept_keys: [],
        ability_keys: [],
      })),
      canonicalizeBundle: jest.fn((text: string) => text),
      getDefinitions: jest.fn(() => ({})),
      getKeywordAbilities: jest.fn(() => ({})),
      getResolverThresholds: jest.fn(() => ({ prefix_len_min: 3 })),
      getSectionDefaults: jest.fn(() => ({})),
      getStopwords: jest.fn(() => ['the', 'a', 'of', 'does', 'what']),
      loadRouterMap: jest.fn((json: unknown) => json),
      normalize: jest.fn((text: string) => text.toLowerCase()),
      route: jest.fn(() => ({
        section_intents: [],
        concept_default_rule_ids: [],
        hard_includes: [],
      })),
      tokenEst: jest.fn((text: string) => text.length),
    }));

    const bloodMoonCard = {
      oracle_id: 'oracle:blood-moon',
      name: 'Blood Moon',
      oracle_text: 'Nonbasic lands are Mountains.',
    };
    const rule3057 = {
      rule_id: '305.7',
      section: 305,
      text: "If an effect sets a land's subtype to one or more of the basic land types, the land loses all abilities and gains the corresponding mana abilities.",
      tokens_json: '["effect","sets","land","subtype","basic","land","types"]',
    };

    jest.doMock('../src/rag/packDbRN', () => ({
      openCardsDb: jest.fn(() => ({
        cardByNameNorm: jest.fn(() => bloodMoonCard),
        cardByOracleId: jest.fn(() => bloodMoonCard),
        cardsByPrefix: jest.fn(() => []),
        prefixCandidateOracleIds: jest.fn(() => []),
        close: jest.fn(),
      })),
      openRulesDb: jest.fn(() => ({
        rulesBySection: jest.fn(() => []),
        ruleById: jest.fn((ruleId: string) =>
          ruleId === '305.7' ? rule3057 : null,
        ),
        ruleFromSectionContaining: jest.fn(),
        rulesByRuleIdPrefix: jest.fn(() => []),
        close: jest.fn(),
      })),
    }));

    const { getContextRN } =
      require('../src/rag/getContextRN') as typeof import('../src/rag/getContextRN');

    const reader = {
      readFile: jest.fn(async (path: string) => {
        if (path === 'manifest.json') {
          return JSON.stringify({
            sidecars: {
              capabilities: {
                context_provider: {
                  files: {
                    router_map: { path: 'router/router_map.json' },
                  },
                },
              },
            },
          });
        }
        if (path === 'router/router_map.json') {
          return JSON.stringify({});
        }
        throw new Error(`unexpected path: ${path}`);
      }),
      readFileBinary: jest.fn(),
    };

    const result = await getContextRN(
      'What does blood moon do?',
      '/tmp/content_pack',
      reader,
    );

    expect(result.bundle.cards).toEqual([
      expect.objectContaining({ name: 'Blood Moon' }),
    ]);
    expect(result.bundle.rules).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule_id: '305.7' })]),
    );
  });
});
