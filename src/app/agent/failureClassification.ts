import {
  CONTEXT_RETRIEVAL_EMPTY,
  readAttributionErrorKind,
} from '../../rag/errors';

export type FailureStage = 'speech' | 'retrieval' | 'model' | 'request' | 'unknown';
export type FailureRecoverability = 'recoverable' | 'terminal' | 'ignored';
export type FailureTransientEvent = 'softFail' | 'terminalFail' | null;

export type FailureKind =
  | 'speech_no_transcript'
  | 'retrieval_empty_bundle'
  | 'retrieval_unavailable'
  | 'model_unavailable'
  | 'request_cancelled'
  | 'semantic_front_door'
  | 'unknown';

export type FailureClassification = {
  kind: FailureKind;
  stage: FailureStage;
  recoverability: FailureRecoverability;
  transientEvent: FailureTransientEvent;
  telemetryReason: string;
};

const RECOVERABLE_FAILURES: Record<string, FailureClassification> = {
  noUsableTranscript: {
    kind: 'speech_no_transcript',
    stage: 'speech',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: 'speechNoTranscript',
  },
  speechErrorRecoverable: {
    kind: 'speech_no_transcript',
    stage: 'speech',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: 'speechNoTranscript',
  },
  speechCaptureFailed: {
    kind: 'speech_no_transcript',
    stage: 'speech',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: 'speechCapture',
  },
  interactionRejected: {
    kind: 'unknown',
    stage: 'speech',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: 'interactionRejected',
  },
  semanticFrontDoorTranscript: {
    kind: 'semantic_front_door',
    stage: 'request',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: 'semanticFrontDoorTranscript',
  },
  semanticFrontDoorNoGrounding: {
    kind: 'semantic_front_door',
    stage: 'request',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: 'semanticFrontDoorNoGrounding',
  },
  semanticFrontDoorClarify: {
    kind: 'semantic_front_door',
    stage: 'request',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: 'semanticFrontDoorClarify',
  },
  noGroundingClarify: {
    kind: 'semantic_front_door',
    stage: 'request',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: 'no_grounding_clarify',
  },
  semanticFrontDoorRestates: {
    kind: 'semantic_front_door',
    stage: 'request',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: 'semanticFrontDoorRestates',
  },
  semanticFrontDoorRepairRequest: {
    kind: 'semantic_front_door',
    stage: 'request',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: 'semanticFrontDoorRepairRequest',
  },
};

const TERMINAL_FAILURES: Record<string, FailureClassification> = {
  E_NOT_INITIALIZED: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
  E_EMBED: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
  E_EMBED_MISMATCH: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
  E_DETERMINISTIC_ONLY: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
  E_MODEL_PATH: {
    kind: 'model_unavailable',
    stage: 'model',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'modelLoad',
  },
  E_COMPLETION: {
    kind: 'unknown',
    stage: 'request',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'inference',
  },
  E_OLLAMA: {
    kind: 'unknown',
    stage: 'request',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'inference',
  },
  E_PACK_LOAD: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
  E_PACK_SCHEMA: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
  E_INDEX_META: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
  E_VALIDATE_CAPABILITY: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
  E_VALIDATE_SCHEMA: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
  E_RETRIEVAL_FORMAT: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
  E_COUNTS_MISMATCH: {
    kind: 'retrieval_unavailable',
    stage: 'retrieval',
    recoverability: 'terminal',
    transientEvent: 'terminalFail',
    telemetryReason: 'retrieval',
  },
};

const DEFAULT_TERMINAL_FAILURE: FailureClassification = {
  kind: 'unknown',
  stage: 'unknown',
  recoverability: 'terminal',
  transientEvent: 'terminalFail',
  telemetryReason: 'request',
};

/** Maps substrate `front_door_verdict` to a recoverable reason key (distinct telemetry). */
export function recoverableReasonKeyForFrontDoorVerdict(
  verdict:
    | 'proceed_to_retrieval'
    | 'clarify_entity'
    | 'clarify_no_grounding'
    | 'abstain_no_grounding'
    | 'abstain_transcript'
    | 'restates_request'
    | 'repair_request',
): keyof typeof RECOVERABLE_FAILURES {
  switch (verdict) {
    case 'abstain_transcript':
      return 'semanticFrontDoorTranscript';
    case 'abstain_no_grounding':
      return 'semanticFrontDoorNoGrounding';
    case 'clarify_entity':
      return 'semanticFrontDoorClarify';
    case 'clarify_no_grounding':
      return 'noGroundingClarify';
    case 'restates_request':
      return 'semanticFrontDoorRestates';
    case 'repair_request':
      return 'semanticFrontDoorRepairRequest';
    case 'proceed_to_retrieval':
      throw new Error(
        'recoverableReasonKeyForFrontDoorVerdict: proceed_to_retrieval is not a blocked front-door verdict',
      );
    default: {
      const _exhaustive: never = verdict;
      throw new Error(`Unexpected front_door_verdict: ${String(_exhaustive)}`);
    }
  }
}

export function classifyRecoverableFailure(reason: string): FailureClassification {
  return RECOVERABLE_FAILURES[reason] ?? {
    kind: 'unknown',
    stage: 'unknown',
    recoverability: 'recoverable',
    transientEvent: 'softFail',
    telemetryReason: reason,
  };
}

export function classifyTerminalFailure(error: unknown): FailureClassification {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';

  const attributionKind = readAttributionErrorKind(error);
  if (code === 'E_RETRIEVAL' && attributionKind === CONTEXT_RETRIEVAL_EMPTY) {
    return {
      kind: 'retrieval_empty_bundle',
      stage: 'retrieval',
      recoverability: 'terminal',
      transientEvent: 'terminalFail',
      telemetryReason: 'retrieval',
    };
  }

  if (code === 'E_RETRIEVAL') {
    return {
      kind: 'retrieval_unavailable',
      stage: 'retrieval',
      recoverability: 'terminal',
      transientEvent: 'terminalFail',
      telemetryReason: 'retrieval',
    };
  }

  return code ? (TERMINAL_FAILURES[code] ?? DEFAULT_TERMINAL_FAILURE) : DEFAULT_TERMINAL_FAILURE;
}
