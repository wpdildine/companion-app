import { checkFrontDoorBeforeRetrieval } from '../src/rag/frontDoorGate';

const mockGetContextRN = jest.fn();

jest.mock('../src/rag/getContextRN', () => ({
  getContextRN: (...args: unknown[]) => mockGetContextRN(...args),
}));

describe('frontDoorGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns blocked when getContextRN reports a non-proceed verdict', async () => {
    mockGetContextRN.mockResolvedValue({
      bundle: {
        cards: [],
        rules: [],
        keywords: [],
        routing_trace: { sections_considered: [], sections_selected: [] },
      },
      final_context_bundle_canonical: '',
      semanticFrontDoor: {
        contract_version: 1,
        working_query: 'Partner with Kraum',
        resolver_mode: 'none',
        transcript_decision: 'pass_through',
        front_door_verdict: 'abstain_no_grounding',
        routing_readiness: { sections_selected: [] },
      },
    });

    const reader = {
      readFile: async () => '',
      readFileBinary: async () => new ArrayBuffer(0),
    };

    const r = await checkFrontDoorBeforeRetrieval(
      'Partner with Kraum',
      '/pack',
      reader,
    );
    expect(r.blocked).toBe(true);
    expect(r.semanticFrontDoor.front_door_verdict).toBe('abstain_no_grounding');
    expect(mockGetContextRN).toHaveBeenCalledWith(
      'Partner with Kraum',
      '/pack',
      reader,
    );
  });

  it('returns not blocked when verdict is proceed_to_retrieval', async () => {
    mockGetContextRN.mockResolvedValue({
      bundle: {
        cards: [],
        rules: [],
        keywords: [],
        routing_trace: { sections_considered: [], sections_selected: [] },
      },
      final_context_bundle_canonical: '',
      semanticFrontDoor: {
        contract_version: 1,
        working_query: 'layers',
        resolver_mode: 'resolved',
        transcript_decision: 'pass_through',
        front_door_verdict: 'proceed_to_retrieval',
        routing_readiness: { sections_selected: ['100'] },
      },
    });

    const r = await checkFrontDoorBeforeRetrieval('layers', '/pack', {
      readFile: async () => '',
      readFileBinary: async () => new ArrayBuffer(0),
    });
    expect(r.blocked).toBe(false);
  });
});
