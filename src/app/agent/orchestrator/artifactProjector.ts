import { extractIntentSignals } from '@atlas/runtime';
import type { ValidationSummary } from '../../../rag';
import type { FailureClassification } from '../failureClassification';

export type TraceRef = {
  trace_id: string;
  span_id: string;
};

export type ContextSignal = {
  type: string;
  weight: number;
  evidence: string;
};

export type ContextEntity = {
  text: string;
  // Span is intentionally placeholder-bounded in this cycle when upstream span data is unavailable.
  span: [number, number];
};

export interface ContextArtifact {
  artifact_kind: 'context';
  artifact_id: string;
  version: string;
  timestamp_ms: number;
  request_id: string;
  input: {
    raw_text: string;
    normalized_text: string;
  };
  routing: {
    intent: string;
    confidence: number;
    ambiguity_flag: boolean;
    clarification_required: boolean;
    domain_validity: boolean;
    proceed_mode: string;
  };
  signals: ContextSignal[];
  entities: ContextEntity[];
  fallback_used: boolean;
  trace_ref: TraceRef;
}

export interface SettlementArtifact {
  artifact_kind: 'settlement';
  artifact_id: string;
  version: string;
  timestamp_ms: number;
  request_id: string;
  lifecycle: string;
  response: {
    final_text: string;
  };
  structured_payload: {
    entities: ContextEntity[];
    rules: string[];
    metadata: Record<string, unknown>;
  };
  validation: {
    status: string;
    checks_passed: string[];
    checks_failed: string[];
  };
  routing_ref: {
    intent: string;
    proceed_mode: string;
  };
  trace_ref: TraceRef;
}

export interface FailureArtifact {
  artifact_kind: 'failure';
  artifact_id: string;
  version: string;
  timestamp_ms: number;
  request_id: string;
  failure: {
    type: string;
    classification: string;
    stage: string;
  };
  routing_ref: {
    intent: string;
    proceed_mode: string;
    confidence: number;
  };
  recoverable: boolean;
  trace_ref: TraceRef;
}

export const CYCLE1_ARTIFACT_VERSION = '1';

function artifactId(kind: string, requestId: number): string {
  return `${kind}:${requestId}:${CYCLE1_ARTIFACT_VERSION}`;
}

function makeTraceRef(requestId: number, spanId: string): TraceRef {
  return {
    trace_id: String(requestId),
    span_id: spanId,
  };
}

function extractEntitiesFromValidationSummary(
  validationSummary: ValidationSummary | null | undefined,
): ContextEntity[] {
  if (!validationSummary) return [];
  return validationSummary.cards.map(c => ({
    text: c.canonical ?? c.raw,
    // No span offsets are currently available in the app-side validation summary.
    span: [0, 0],
  }));
}

function projectRoutingAndSignals(rawText: string, domainValid: boolean) {
  const intentSignals = extractIntentSignals(rawText ?? '');

  const flattened = [
    ...intentSignals.intents.map(s => ({ type: `intent:${s}` })),
    ...intentSignals.relationships.map(s => ({ type: `relationship:${s}` })),
    ...intentSignals.triggers.map(s => ({ type: `trigger:${s}` })),
  ];
  const total = flattened.length;
  const weight = total > 0 ? 1 / total : 0;

  const signals: ContextSignal[] = flattened.map(s => ({
    type: s.type,
    weight,
    evidence: 'extractIntentSignals',
  }));

  const intents = intentSignals.intents ?? [];
  const intent = intents[0] ?? 'unknown';
  const confidence = intents.length > 0 ? 1 : 0;
  const ambiguity_flag = intents.length > 1;
  const clarification_required = ambiguity_flag;
  const proceed_mode = clarification_required ? 'clarify' : 'proceed';

  return {
    routing: {
      intent,
      confidence,
      ambiguity_flag,
      clarification_required,
      domain_validity: domainValid,
      proceed_mode,
    },
    signals,
  };
}

export function projectContextArtifact(args: {
  requestId: number;
  timestampMs: number;
  rawText: string;
  normalizedText: string;
  domainValid: boolean;
  validationSummary?: ValidationSummary | null;
  fallbackUsed?: boolean;
}): ContextArtifact {
  const { requestId, timestampMs, rawText, normalizedText, domainValid } = args;

  const { routing, signals } = projectRoutingAndSignals(rawText, domainValid);
  const entities = extractEntitiesFromValidationSummary(args.validationSummary);

  return {
    artifact_kind: 'context',
    artifact_id: artifactId('context', requestId),
    version: CYCLE1_ARTIFACT_VERSION,
    timestamp_ms: timestampMs,
    request_id: String(requestId),
    input: {
      raw_text: rawText,
      normalized_text: normalizedText,
    },
    routing,
    signals,
    entities,
    fallback_used: args.fallbackUsed ?? false,
    trace_ref: makeTraceRef(requestId, 'context'),
  };
}

export function projectSettlementArtifact(args: {
  requestId: number;
  timestampMs: number;
  lifecycle: string;
  rawText: string;
  normalizedText: string;
  responseText: string;
  validationSummary: ValidationSummary;
}): SettlementArtifact {
  const { requestId, timestampMs, lifecycle, rawText, normalizedText } = args;

  const { routing, signals: _signalsUnused } = projectRoutingAndSignals(
    rawText,
    true,
  );

  const entities = extractEntitiesFromValidationSummary(args.validationSummary);
  const rules = args.validationSummary.rules.map(r => r.canonical ?? r.raw);

  const checks_passed = args.validationSummary.rules
    .filter(r => r.status === 'valid')
    .map(r => r.canonical ?? r.raw);
  const checks_failed = args.validationSummary.rules
    .filter(r => r.status === 'invalid')
    .map(r => r.canonical ?? r.raw);

  const status = checks_failed.length > 0 ? 'failed' : 'passed';

  return {
    artifact_kind: 'settlement',
    artifact_id: artifactId('settlement', requestId),
    version: CYCLE1_ARTIFACT_VERSION,
    timestamp_ms: timestampMs,
    request_id: String(requestId),
    lifecycle,
    response: {
      final_text: args.responseText,
    },
    structured_payload: {
      entities,
      rules,
      metadata: {
        cardsCount: args.validationSummary.cards.length,
        rulesCount: args.validationSummary.rules.length,
        stats: args.validationSummary.stats,
        normalized_input: normalizedText,
      },
    },
    validation: {
      status,
      checks_passed,
      checks_failed,
    },
    routing_ref: {
      intent: routing.intent,
      proceed_mode: routing.proceed_mode,
    },
    trace_ref: makeTraceRef(requestId, 'settlement'),
  };
}

export function projectFailureArtifact(args: {
  requestId: number;
  timestampMs: number;
  rawText: string;
  normalizedText: string;
  failureClassification: FailureClassification;
  domainValid: boolean;
}): FailureArtifact {
  const { requestId, timestampMs, rawText, domainValid, failureClassification } =
    args;

  const { routing } = projectRoutingAndSignals(rawText, domainValid);

  return {
    artifact_kind: 'failure',
    artifact_id: artifactId('failure', requestId),
    version: CYCLE1_ARTIFACT_VERSION,
    timestamp_ms: timestampMs,
    request_id: String(requestId),
    failure: {
      type: failureClassification.kind,
      classification: failureClassification.telemetryReason,
      stage: failureClassification.stage,
    },
    routing_ref: {
      intent: routing.intent,
      proceed_mode: routing.proceed_mode,
      confidence: routing.confidence,
    },
    recoverable: failureClassification.recoverability === 'recoverable',
    trace_ref: makeTraceRef(requestId, 'failure'),
  };
}

