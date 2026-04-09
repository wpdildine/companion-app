/**
 * Request pipeline runner: pack init, RAG ask, streaming/validation/settling.
 * Callback-driven and result-returning: returns ExecuteRequestResult only; does not mutate
 * orchestrator lifecycle, mode, error, or audio state. Orchestrator commits from this result
 * (completed, failed, or stale).
 */

import type { FailureIntent, SemanticFrontDoor } from '@atlas/runtime';
import type { RepairFollowUpKind } from '../../../rag/repairFollowUp';
import { Platform } from 'react-native';
import {
  ask as ragAsk,
  init as ragInit,
  type PackFileReader,
  type ValidationSummary,
} from '../../../rag';
import {
  isLogGateEnabled,
  logError,
  logInfo,
  logWarn,
} from '../../../shared/logging';
import { readAttributionErrorKind } from '../../../rag/errors';
import type { FailureClassification } from '../failureClassification';
import {
  classifyRecoverableFailure,
  classifyTerminalFailure,
  recoverableReasonKeyForFrontDoorVerdict,
} from '../failureClassification';
import type { RequestDebugEmitPayload } from '../requestDebugTypes';
import { appendSemanticEvidenceEvent } from '../semanticEvidenceSink';
import type { ObservedEvent } from '../semanticEvidenceTypes';
import type { AgentOrchestratorListeners, ProcessingSubstate } from '../types';
import { resolveScriptedAnswerSlot } from '../scripted/resolveScriptedAnswerSlot';
import { SCRIPTED_EMPTY_OUTPUT_MESSAGE } from '../scripted/v1Copy';
import { stripHumanShortInlineRuleQuoteForCommit } from './stripHumanShortInlineRuleQuoteForCommit';

export const PARTIAL_EMIT_THROTTLE_MS = 400;
export const RESPONSE_TEXT_UPDATE_THROTTLE_MS = 150;
/** @deprecated Prefer SCRIPTED_EMPTY_OUTPUT_MESSAGE from scripted/v1Copy; kept for tests and call sites. */
export const EMPTY_RESPONSE_FALLBACK_MESSAGE = SCRIPTED_EMPTY_OUTPUT_MESSAGE;

const CHAT_MODEL_FILENAME = 'model.gguf';

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

function summarizeValidationSummary(validationSummary: ValidationSummary): {
  cards: string[];
  rules: string[];
} {
  return {
    cards: validationSummary.cards.map(card => card.canonical ?? card.raw),
    rules: validationSummary.rules.map(rule => rule.canonical ?? rule.raw),
  };
}

export type Ref<T> = { current: T };

export interface ExecuteRequestOptions {
  requestId: number;
  question: string;
  requestDebugSink:
    | ((payload: RequestDebugEmitPayload & { type: string }) => void)
    | undefined;
  activeRequestIdRef: Ref<number>;
  setResponseText: (t: string | null) => void;
  setValidationSummary: (v: ValidationSummary | null) => void;
  setProcessingSubstate: (s: ProcessingSubstate | null) => void;
  listenersRef: Ref<AgentOrchestratorListeners | null>;
  getPackState: () => boolean;
  copyBundlePackToDocuments: () => Promise<string>;
  getContentPackPathInDocuments: () => Promise<string | null>;
  createDocumentsPackReader: (root: string) => PackFileReader | null;
  createBundlePackReader: () => PackFileReader | null;
  createThrowReader: (msg: string) => PackFileReader;
  getPackEmbedModelId: (reader: PackFileReader) => Promise<string>;
  getOnDeviceModelPaths: (
    packRoot?: string,
  ) => Promise<{ embedModelPath: string; chatModelPath: string }>;
  previousCommittedResponseRef: Ref<string | null>;
  previousCommittedValidationRef: Ref<ValidationSummary | null>;
  /** Optional mirror of listener milestones for semantic evidence (read-only). */
  semanticEvidenceEventsRef?: Ref<ObservedEvent[]>;
  /** When set, RAG classifies follow-up vs proposed repair before normal ask (runtime seam). */
  pendingRepair?: { repairedQuery: string; requestId: number };
}

export type ExecuteRequestResult =
  | {
      status: 'completed';
      committedText: string;
      validationSummary: ValidationSummary;
      shouldPlay: boolean;
      failureIntent?: FailureIntent | null;
    }
  | {
      status: 'failed';
      classification: FailureClassification;
      displayMessage: string;
    }
  | {
      status: 'front_door';
      semanticFrontDoor: SemanticFrontDoor;
    }
  | {
      status: 'stale';
    }
  | {
      status: 'repair_follow_up';
      kind: RepairFollowUpKind;
    };

export type { RepairFollowUpKind };

/**
 * Runs one RAG request and returns a terminal result for the orchestrator to commit.
 * The orchestrator remains the owner of lifecycle, request ids, and playback handoff.
 */
export async function executeRequest(
  options: ExecuteRequestOptions,
): Promise<ExecuteRequestResult> {
  const {
    requestId: reqId,
    question,
    requestDebugSink,
    activeRequestIdRef,
    setResponseText,
    setValidationSummary,
    setProcessingSubstate,
    listenersRef,
    getPackState: getPackStateFn,
    copyBundlePackToDocuments: copyBundlePackToDocumentsFn,
    getContentPackPathInDocuments,
    createDocumentsPackReader,
    createBundlePackReader,
    createThrowReader,
    getPackEmbedModelId,
    getOnDeviceModelPaths,
    previousCommittedResponseRef,
    previousCommittedValidationRef,
    semanticEvidenceEventsRef,
    pendingRepair,
  } = options;

  let firstChunkSent = false;
  let lastPartialEmitAt = 0;
  let lastResponseTextUpdateAt = 0;

  try {
    if (pendingRepair != null) {
      if (reqId !== activeRequestIdRef.current) {
        previousCommittedResponseRef.current = null;
        previousCommittedValidationRef.current = null;
        return { status: 'stale' };
      }
      const repairAsk = await ragAsk(question, {
        requestId: reqId,
        requestDebugSink: requestDebugSink ?? undefined,
        pendingRepairCandidate: pendingRepair,
      });
      if (repairAsk.repairFollowUp) {
        return {
          status: 'repair_follow_up',
          kind: repairAsk.repairFollowUp,
        };
      }
    }
    if (!getPackStateFn()) {
      let packRoot: string;
      try {
        packRoot = await copyBundlePackToDocumentsFn();
      } catch (e) {
        logInfo('Runtime', 'Copy pack to Documents failed, using bundle', {
          message: e instanceof Error ? e.message : String(e),
        });
        packRoot = (await getContentPackPathInDocuments()) ?? '';
      }
      logInfo('Runtime', 'pack path resolved', {
        packRoot,
        hasPackRoot: !!packRoot,
        usingDocumentsReader: !!packRoot,
      });
      const reader =
        (packRoot ? createDocumentsPackReader(packRoot) : null) ??
        createBundlePackReader() ??
        createThrowReader(
          'Pack not configured. Add the content pack to assets/content_pack and rebuild the app.',
        );
      const embedModelId = await getPackEmbedModelId(reader);
      const { embedModelPath, chatModelPath } = await getOnDeviceModelPaths(
        packRoot || undefined,
      );
      await ragInit(
        {
          embedModelId,
          embedModelPath,
          chatModelPath,
          packRoot: packRoot || '',
        },
        reader,
        { requestDebugSink: requestDebugSink ?? undefined },
      );
    }
    const generationStartedAt = Date.now();
    requestDebugSink?.({
      type: 'generation_start',
      requestId: reqId,
      generationStartedAt,
      timestamp: generationStartedAt,
    });
    logInfo('AgentOrchestrator', 'generation started', { requestId: reqId });
    listenersRef.current?.onGenerationStart?.();
    appendSemanticEvidenceEvent(semanticEvidenceEventsRef, {
      kind: 'onGenerationStart',
      source: 'orchestrator',
      payload: { requestId: reqId },
    });
    const result = await ragAsk(question, {
      requestId: reqId,
      requestDebugSink: requestDebugSink ?? undefined,
      onRetrievalComplete: () => {
        if (activeRequestIdRef.current !== reqId) return;
        setProcessingSubstate('preparingContext');
        requestDebugSink?.({
          type: 'processing_substate',
          requestId: reqId,
          processingSubstate: 'preparingContext',
          timestamp: Date.now(),
        });
      },
      onModelLoadStart: () => {
        if (activeRequestIdRef.current !== reqId) return;
        setProcessingSubstate('loadingModel');
        requestDebugSink?.({
          type: 'processing_substate',
          requestId: reqId,
          processingSubstate: 'loadingModel',
          timestamp: Date.now(),
        });
      },
      onGenerationStart: () => {
        if (activeRequestIdRef.current !== reqId) return;
        setProcessingSubstate('awaitingFirstToken');
        requestDebugSink?.({
          type: 'processing_substate',
          requestId: reqId,
          processingSubstate: 'awaitingFirstToken',
          timestamp: Date.now(),
        });
      },
      onValidationStart: () => {
        if (activeRequestIdRef.current !== reqId) return;
        const validationStartedAt = Date.now();
        setProcessingSubstate('validating');
        requestDebugSink?.({
          type: 'validation_start',
          requestId: reqId,
          validationStartedAt,
          timestamp: validationStartedAt,
        });
        logInfo('AgentOrchestrator', 'validation_start', {
          requestId: reqId,
          lifecycle: 'processing',
          processingSubstate: 'validating',
        });
        requestDebugSink?.({
          type: 'processing_substate',
          requestId: reqId,
          processingSubstate: 'validating',
          lifecycle: 'processing',
          timestamp: validationStartedAt,
        });
      },
      onPartial: (accumulatedText: string) => {
        if (activeRequestIdRef.current !== reqId) return;
        const now = Date.now();
        const isFirstChunk = !firstChunkSent && accumulatedText.length > 0;
        if (isFirstChunk) {
          firstChunkSent = true;
          lastResponseTextUpdateAt = now;
          setResponseText(accumulatedText);
          setProcessingSubstate('streaming');
          requestDebugSink?.({
            type: 'processing_substate',
            requestId: reqId,
            processingSubstate: 'streaming',
            timestamp: now,
          });
          const firstTokenAt = now;
          requestDebugSink?.({
            type: 'first_token',
            requestId: reqId,
            firstTokenAt,
            timestamp: firstTokenAt,
          });
          logInfo('AgentOrchestrator', 'first token received', {
            requestId: reqId,
          });
          logInfo('ResponseSurface', 'response_surface_streaming_started', {
            requestId: reqId,
            lifecycle: 'processing',
            processingSubstate: 'streaming',
            partialChars: accumulatedText.length,
          });
          listenersRef.current?.onFirstToken?.();
          appendSemanticEvidenceEvent(semanticEvidenceEventsRef, {
            kind: 'onFirstToken',
            source: 'orchestrator',
            payload: { requestId: reqId },
          });
        } else {
          if (
            now - lastResponseTextUpdateAt >=
            RESPONSE_TEXT_UPDATE_THROTTLE_MS
          ) {
            lastResponseTextUpdateAt = now;
            setResponseText(accumulatedText);
          }
        }
        if (now - lastPartialEmitAt >= PARTIAL_EMIT_THROTTLE_MS) {
          lastPartialEmitAt = now;
          requestDebugSink?.({
            type: 'partial_output',
            requestId: reqId,
            accumulatedText,
            timestamp: now,
          });
        }
      },
    });
    const retrievalEndedAt = Date.now();
    requestDebugSink?.({
      type: 'retrieval_end',
      requestId: reqId,
      retrievalEndedAt,
      packIdentity: null,
      timestamp: retrievalEndedAt,
    });
    logInfo('AgentOrchestrator', 'retrieval completed', { requestId: reqId });
    listenersRef.current?.onRetrievalEnd?.();
    appendSemanticEvidenceEvent(semanticEvidenceEventsRef, {
      kind: 'onRetrievalEnd',
      source: 'orchestrator',
      payload: { requestId: reqId },
    });
    if (result.frontDoorBlocked && result.semanticFrontDoor) {
      const fd = result.semanticFrontDoor;
      // Runtime semanticFrontDoor is sole authority after retrieval: never re-block or emit
      // clarify paths when substrate already returned proceed_to_retrieval.
      if (fd.front_door_verdict === 'proceed_to_retrieval') {
        if (__DEV__) {
          logWarn(
            'AgentOrchestrator',
            'invariant: ignoring frontDoorBlocked after retrieval when verdict is proceed_to_retrieval',
            { requestId: reqId },
          );
        }
      } else {
        const recoverable = classifyRecoverableFailure(
          recoverableReasonKeyForFrontDoorVerdict(fd.front_door_verdict),
        );
        requestDebugSink?.({
          type: 'semantic_front_door',
          requestId: reqId,
          frontDoorVerdict: fd.front_door_verdict,
          resolverMode: fd.resolver_mode,
          transcriptDecision: fd.transcript_decision,
          telemetryReason: recoverable.telemetryReason,
          timestamp: Date.now(),
        });
        logInfo('AgentOrchestrator', 'semantic front door blocked request', {
          requestId: reqId,
          frontDoorVerdict: fd.front_door_verdict,
          telemetryReason: recoverable.telemetryReason,
        });
        return {
          status: 'front_door',
          semanticFrontDoor: fd,
        };
      }
    }
    if (reqId !== activeRequestIdRef.current) {
      previousCommittedResponseRef.current = null;
      previousCommittedValidationRef.current = null;
      logWarn(
        'AgentOrchestrator',
        'stale completion ignored (non-active request)',
        {
          requestId: reqId,
          activeRequestId: activeRequestIdRef.current,
        },
      );
      return { status: 'stale' };
    }
    const nudgedRaw = result.nudged;
    const failureIntent: FailureIntent | null = result.failure_intent ?? null;
    const nudgedForCommit = stripHumanShortInlineRuleQuoteForCommit(nudgedRaw);
    const committedText = resolveScriptedAnswerSlot({
      path: 'settle',
      nudgedRaw: nudgedForCommit,
      failureIntent,
    });
    const isEmptyOutput = nudgedRaw.trim().length === 0;
    if (isEmptyOutput) {
      logInfo('ResponseSurface', 'response_surface_empty_output', {
        requestId: reqId,
        lifecycle: 'processing',
        disposition: 'empty',
      });
    }
    setResponseText(committedText);
    setValidationSummary(result.validationSummary);
    if (!firstChunkSent) {
      logInfo('AgentOrchestrator', 'first token received', {
        requestId: reqId,
      });
      listenersRef.current?.onFirstToken?.();
      appendSemanticEvidenceEvent(semanticEvidenceEventsRef, {
        kind: 'onFirstToken',
        source: 'orchestrator',
        payload: { requestId: reqId },
      });
    }
    const generationEndedAt = Date.now();
    requestDebugSink?.({
      type: 'partial_output',
      requestId: reqId,
      accumulatedText: committedText,
      timestamp: generationEndedAt,
    });
    requestDebugSink?.({
      type: 'generation_end',
      requestId: reqId,
      generationEndedAt,
      finalSettledOutput: committedText,
      validationSummary: result.validationSummary,
      timestamp: generationEndedAt,
    });
    logInfo('AgentOrchestrator', 'generation completed', { requestId: reqId });
    logInfo('AgentOrchestrator', 'result payload ready', {
      requestId: reqId,
      responseChars: committedText.length,
      rulesCount: result.validationSummary.rules.length,
      cardsCount: result.validationSummary.cards.length,
    });
    listenersRef.current?.onGenerationEnd?.();
    appendSemanticEvidenceEvent(semanticEvidenceEventsRef, {
      kind: 'onGenerationEnd',
      source: 'orchestrator',
      payload: { requestId: reqId },
    });
    listenersRef.current?.onComplete?.();
    appendSemanticEvidenceEvent(semanticEvidenceEventsRef, {
      kind: 'onComplete',
      source: 'orchestrator',
      payload: { requestId: reqId },
    });
    const validationEndedAt = Date.now();
    const settlingStartedAt = validationEndedAt;
    setProcessingSubstate('settling');
    requestDebugSink?.({
      type: 'validation_end',
      requestId: reqId,
      validationEndedAt,
      timestamp: validationEndedAt,
    });
    logInfo('AgentOrchestrator', 'validation_end', {
      requestId: reqId,
      lifecycle: 'processing',
      processingSubstate: 'settling',
    });
    requestDebugSink?.({
      type: 'settling_start',
      requestId: reqId,
      settlingStartedAt,
      timestamp: settlingStartedAt,
    });
    logInfo('AgentOrchestrator', 'settling_start', {
      requestId: reqId,
      lifecycle: 'processing',
      processingSubstate: 'settling',
    });
    requestDebugSink?.({
      type: 'processing_substate',
      requestId: reqId,
      processingSubstate: 'settling',
      lifecycle: 'processing',
      timestamp: settlingStartedAt,
    });
    const settledAt = Date.now();
    requestDebugSink?.({
      type: 'response_settled',
      requestId: reqId,
      lifecycle: 'processing',
      processingSubstate: 'settling',
      committedChars: committedText.length,
      rulesCount: result.validationSummary.rules.length,
      cardsCount: result.validationSummary.cards.length,
      finalSettledOutput: committedText,
      validationSummary: result.validationSummary,
      timestamp: settledAt,
    });
    if (isLogGateEnabled('playbackHandoff')) {
      logInfo('ResponseSurface', 'response_settled', {
        requestId: reqId,
        lifecycle: 'processing',
        processingSubstate: 'settling',
        committedChars: committedText.length,
        rulesCount: result.validationSummary.rules.length,
        cardsCount: result.validationSummary.cards.length,
      });
    }
    if (isLogGateEnabled('settlementPayload')) {
      logInfo('ResponseSurface', 'response_settled_payload', {
        requestId: reqId,
        committedResponseText: committedText,
        ...summarizeValidationSummary(result.validationSummary),
      });
    }
    previousCommittedResponseRef.current = null;
    previousCommittedValidationRef.current = null;
    return {
      status: 'completed',
      committedText,
      validationSummary: result.validationSummary,
      shouldPlay: committedText.length > 0 && !isEmptyOutput,
      failureIntent,
    };
  } catch (e) {
    const msg = errorMessage(e);
    const code =
      e && typeof e === 'object' && 'code' in e
        ? (e as { code: string }).code
        : '';
    const failureClassification = classifyTerminalFailure(e);
    const attributionErrorKind = readAttributionErrorKind(e);
    let displayMsg = code ? `[${code}] ${msg}` : msg;
    if (code === 'E_MODEL_PATH' && Platform.OS === 'android') {
      displayMsg += ` Put the chat GGUF in the app's files/models/ folder (filename: ${CHAT_MODEL_FILENAME}).`;
    }
    if (reqId === activeRequestIdRef.current) {
      const failedAt = Date.now();
      requestDebugSink?.({
        type: 'request_failed',
        requestId: reqId,
        failureReason: failureClassification.telemetryReason,
        status: 'failed',
        completedAt: failedAt,
        lifecycle: 'error',
        timestamp: failedAt,
        ...(attributionErrorKind !== undefined
          ? { attributionErrorKind }
          : {}),
      });
      const requestFailurePayload = {
        requestId: reqId,
        message: displayMsg,
        failureKind: failureClassification.kind,
        failureStage: failureClassification.stage,
        failureReason: failureClassification.telemetryReason,
        ...(attributionErrorKind !== undefined
          ? { attributionErrorKind }
          : {}),
      };
      if (failureClassification.kind === 'retrieval_empty_bundle') {
        logWarn(
          'AgentOrchestrator',
          'request failed (terminal request failure; returning to idle)',
          requestFailurePayload,
        );
      } else {
        logError(
          'AgentOrchestrator',
          'request failed (terminal request failure; returning to idle)',
          requestFailurePayload,
        );
      }
      return {
        status: 'failed',
        classification: failureClassification,
        displayMessage: displayMsg,
      };
    }
    previousCommittedResponseRef.current = null;
    previousCommittedValidationRef.current = null;
    logWarn(
      'AgentOrchestrator',
      'stale completion ignored (non-active request)',
      {
        requestId: reqId,
        activeRequestId: activeRequestIdRef.current,
        message: displayMsg,
      },
    );
    return { status: 'stale' };
  }
}
