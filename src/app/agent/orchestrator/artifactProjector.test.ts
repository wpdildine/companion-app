import type { ValidationSummary } from '../../../rag';
import type { FailureClassification } from '../failureClassification';

jest.mock('@atlas/runtime', () => ({
  extractIntentSignals: jest.fn(),
}));

import { extractIntentSignals } from '@atlas/runtime';
import {
  projectContextArtifact,
  projectFailureArtifact,
  projectSettlementArtifact,
  CYCLE1_ARTIFACT_VERSION,
} from './artifactProjector';

const mockedExtractIntentSignals = extractIntentSignals as unknown as jest.Mock;

describe('artifactProjector (cycle 1)', () => {
  const validationSummary: ValidationSummary = {
    cards: [
      { raw: 'Foo Card', canonical: 'Foo Card', status: 'in_pack' },
      { raw: 'Bar', status: 'unknown' },
    ],
    rules: [
      { raw: '101.1a', canonical: '101.1a', status: 'valid' },
      { raw: '202.2b', canonical: '202.2b', status: 'invalid' },
    ],
    stats: {
      cardHitRate: 0.5,
      ruleHitRate: 0.5,
      unknownCardCount: 1,
      invalidRuleCount: 1,
    },
  };

  const failureClassification: FailureClassification = {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  };

  beforeEach(() => {
    mockedExtractIntentSignals.mockReset();
  });

  it('projects ContextArtifact with routing/proceed_mode and entities', () => {
    mockedExtractIntentSignals.mockReturnValue({
      intents: ['definition', 'comparison'],
      relationships: [],
      triggers: ['struct:question_mark'],
    });

    const a = projectContextArtifact({
      requestId: 10,
      timestampMs: 123,
      rawText: 'What is A compared to B?',
      normalizedText: 'what is a compared to b',
      domainValid: true,
      validationSummary,
      fallbackUsed: false,
    });

    expect(a.artifact_kind).toBe('context');
    expect(a.version).toBe(CYCLE1_ARTIFACT_VERSION);
    expect(a.request_id).toBe('10');
    expect(a.fallback_used).toBe(false);

    // routing intent/confidence derived from first intent
    expect(a.routing.intent).toBe('definition');
    expect(a.routing.confidence).toBe(1);
    // ambiguity_flag is intents.length > 1
    expect(a.routing.ambiguity_flag).toBe(true);
    expect(a.routing.proceed_mode).toBe('clarify');

    // entities derived from validationSummary.cards
    expect(a.entities.length).toBe(2);
    expect(a.entities[0]?.text).toBe('Foo Card');
    expect(a.entities[0]?.span).toEqual([0, 0]);

    // signals include intents + triggers + relationships (flattened)
    expect(a.signals.length).toBe(3);
    expect(a.signals[0]?.evidence).toBe('extractIntentSignals');
    // weight is stable (1/total)
    expect(a.signals[0]?.weight).toBeCloseTo(1 / 3);
  });

  it('projects SettlementArtifact validation pass/fail', () => {
    mockedExtractIntentSignals.mockReturnValue({
      intents: ['yes_no'],
      relationships: [],
      triggers: [],
    });

    const s = projectSettlementArtifact({
      requestId: 11,
      timestampMs: 200,
      lifecycle: 'processing',
      rawText: 'Is X true?',
      normalizedText: 'is x true',
      responseText: 'Answer',
      validationSummary,
    });

    expect(s.artifact_kind).toBe('settlement');
    expect(s.lifecycle).toBe('processing');
    expect(s.response.final_text).toBe('Answer');

    expect(s.validation.status).toBe('failed');
    expect(s.validation.checks_passed).toEqual(['101.1a']);
    expect(s.validation.checks_failed).toEqual(['202.2b']);

    // proceed_mode is based on ambiguity_flag (intents.length > 1)
    expect(s.routing_ref.intent).toBe('yes_no');
    expect(s.routing_ref.proceed_mode).toBe('proceed');
    expect(s.trace_ref.span_id).toBe('settlement');
  });

  it('projects FailureArtifact recoverable=false and routing_ref', () => {
    mockedExtractIntentSignals.mockReturnValue({
      intents: [],
      relationships: ['before'],
      triggers: [],
    });

    const f = projectFailureArtifact({
      requestId: 12,
      timestampMs: 300,
      rawText: 'Random input',
      normalizedText: 'random input',
      failureClassification,
      domainValid: false,
    });

    expect(f.artifact_kind).toBe('failure');
    expect(f.failure.type).toBe('retrieval_unavailable');
    expect(f.failure.classification).toBe('retrieval');
    expect(f.failure.stage).toBe('retrieval');
    expect(f.recoverable).toBe(false);

    // no intents => confidence=0, intent='unknown'
    expect(f.routing_ref.intent).toBe('unknown');
    expect(f.routing_ref.confidence).toBe(0);
    // ambiguity_flag false when intents empty
    expect(f.routing_ref.proceed_mode).toBe('proceed');
    expect(f.trace_ref.span_id).toBe('failure');
  });
});

