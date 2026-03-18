/**
 * Request pipeline runner: pack init, RAG ask, streaming/validation/settling.
 * Callback-driven and result-returning: returns ExecuteRequestResult only; does not mutate
 * orchestrator lifecycle, mode, error, or audio state. Orchestrator commits from this result
 * (completed, failed, or stale).
 */

import { Platform } from 'react-native';
import {
  ask as ragAsk,
  init as ragInit,
  type PackFileReader,
  type ValidationSummary,
} from '../../../rag';
import { logError, logInfo, logWarn, perfTrace } from '../../../shared/logging';
import {
  DIAG_DEFER_RESPONSE_TEXT_ONE_RAF,
  DIAG_DEFER_VALIDATION_SUMMARY_ONE_RAF,
  DIAG_SETTLE_RESPONSE_TEXT_ONLY,
  DIAG_SETTLE_VALIDATION_ONLY,
  DIAG_SKIP_SET_RESPONSE_TEXT_STATE,
  DIAG_SKIP_SETTLEMENT_CONTROL_STATE,
  DIAG_SKIP_SETTLED_PAYLOAD_PUBLICATION,
  traceResponseSurfaceSettledEvent,
} from '../../ui/components/overlays/responseRenderBisectFlags';
import type { FailureClassification } from '../failureClassification';
import { classifyTerminalFailure } from '../failureClassification';
import type { RequestDebugEmitPayload } from '../requestDebugTypes';
import type { AgentOrchestratorListeners, ProcessingSubstate } from '../types';

export const PARTIAL_EMIT_THROTTLE_MS = 400;
export const RESPONSE_TEXT_UPDATE_THROTTLE_MS = 150;
export const EMPTY_RESPONSE_FALLBACK_MESSAGE = 'No answer generated';

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
}

export type ExecuteRequestResult =
  | {
      status: 'completed';
      committedText: string;
      validationSummary: ValidationSummary;
      shouldPlay: boolean;
    }
  | {
      status: 'failed';
      classification: FailureClassification;
      displayMessage: string;
    }
  | {
      status: 'stale';
    };

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
  } = options;

  let firstChunkSent = false;
  let lastPartialEmitAt = 0;
  let lastResponseTextUpdateAt = 0;

  try {
    if (!getPackStateFn()) {
      perfTrace('Runtime', 'pack init start', { requestId: reqId });
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
      perfTrace('Runtime', 'pack init end', { requestId: reqId });
    }
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
    const generationStartedAt = Date.now();
    requestDebugSink?.({
      type: 'generation_start',
      requestId: reqId,
      generationStartedAt,
      timestamp: generationStartedAt,
    });
    logInfo('AgentOrchestrator', 'generation started', { requestId: reqId });
    listenersRef.current?.onGenerationStart?.();
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
        perfTrace('AgentOrchestrator', 'validation start', { requestId: reqId });
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
    const committedText =
      nudgedRaw.trim().length > 0 ? nudgedRaw : EMPTY_RESPONSE_FALLBACK_MESSAGE;
    const isEmptyOutput = nudgedRaw.trim().length === 0;
    if (isEmptyOutput) {
      logInfo('ResponseSurface', 'response_surface_empty_output', {
        requestId: reqId,
        lifecycle: 'processing',
        disposition: 'empty',
      });
    }
    const settleResponseTextOnly = DIAG_SETTLE_RESPONSE_TEXT_ONLY;
    const settleValidationOnly = DIAG_SETTLE_VALIDATION_ONLY;
    const deferValidationSummaryOneRaf = DIAG_DEFER_VALIDATION_SUMMARY_ONE_RAF;
    const deferResponseTextOneRaf = DIAG_DEFER_RESPONSE_TEXT_ONE_RAF;
    const settleFlagsTrue = [
      settleResponseTextOnly,
      settleValidationOnly,
      deferValidationSummaryOneRaf,
      deferResponseTextOneRaf,
    ].filter(Boolean).length;
    const selectedBranch =
      settleResponseTextOnly
        ? 'response_text_only'
        : settleValidationOnly
          ? 'validation_only'
          : deferValidationSummaryOneRaf
            ? 'defer_validation_one_raf'
            : deferResponseTextOneRaf
              ? 'defer_response_text_one_raf'
              : 'default_both_same_tick';
    if (settleFlagsTrue > 1) {
      logWarn('Runtime', 'multiple settle flags true; using priority order', {
        requestId: reqId,
        settleResponseTextOnly,
        settleValidationOnly,
        deferValidationSummaryOneRaf,
        deferResponseTextOneRaf,
        selectedBranch,
      });
    }
    perfTrace('Runtime', 'response settled branch selected', {
      requestId: reqId,
      settleResponseTextOnly,
      settleValidationOnly,
      deferValidationSummaryOneRaf,
      deferResponseTextOneRaf,
      selectedBranch,
    });
    perfTrace('Runtime', 'settled payload publication decision', {
      requestId: reqId,
      skipSettledPayloadPublication: DIAG_SKIP_SETTLED_PAYLOAD_PUBLICATION,
    });
    if (DIAG_SKIP_SETTLED_PAYLOAD_PUBLICATION) {
      perfTrace('Runtime', 'skipped settled payload publication', {
        requestId: reqId,
        skippedCommittedResponseText: true,
        skippedCards: true,
        skippedRules: true,
        skippedValidationSummary: true,
        skippedPlaybackBindingState: false,
      });
    } else {
      perfTrace('Runtime', 'responseText state write decision', {
        requestId: reqId,
        skipSetResponseTextState: DIAG_SKIP_SET_RESPONSE_TEXT_STATE,
        selectedBranch,
        committedTextLength: committedText.length,
      });
      if (selectedBranch === 'response_text_only') {
        if (DIAG_SKIP_SET_RESPONSE_TEXT_STATE) {
          perfTrace('Runtime', 'skipped setResponseText (response settled)', {
            requestId: reqId,
            committedTextLength: committedText.length,
          });
        } else {
          perfTrace('Runtime', 'before setResponseText (response settled)', { requestId: reqId });
          setResponseText(committedText);
          perfTrace('Runtime', 'after setResponseText (response settled)', { requestId: reqId });
        }
      } else if (selectedBranch === 'validation_only') {
        perfTrace('Runtime', 'before setValidationSummary (response settled)', { requestId: reqId });
        setValidationSummary(result.validationSummary);
        perfTrace('Runtime', 'after setValidationSummary (response settled)', { requestId: reqId });
      } else if (selectedBranch === 'defer_validation_one_raf') {
        perfTrace('Runtime', 'before setResponseText (response settled)', { requestId: reqId });
        setResponseText(committedText);
        perfTrace('Runtime', 'after setResponseText (response settled)', { requestId: reqId });
        requestAnimationFrame(() => {
          perfTrace('Runtime', 'before setValidationSummary (deferred rAF)', { requestId: reqId });
          setValidationSummary(result.validationSummary);
          perfTrace('Runtime', 'after setValidationSummary (deferred rAF)', { requestId: reqId });
        });
      } else if (selectedBranch === 'defer_response_text_one_raf') {
        perfTrace('Runtime', 'before setValidationSummary (response settled)', { requestId: reqId });
        setValidationSummary(result.validationSummary);
        perfTrace('Runtime', 'after setValidationSummary (response settled)', { requestId: reqId });
        requestAnimationFrame(() => {
          perfTrace('Runtime', 'before setResponseText (deferred rAF)', { requestId: reqId });
          setResponseText(committedText);
          perfTrace('Runtime', 'after setResponseText (deferred rAF)', { requestId: reqId });
        });
      } else {
        perfTrace('Runtime', 'before setResponseText/setValidationSummary (response settled)', {
          requestId: reqId,
        });
        setResponseText(committedText);
        setValidationSummary(result.validationSummary);
        perfTrace('Runtime', 'after setResponseText/setValidationSummary (response settled)', {
          requestId: reqId,
        });
        requestAnimationFrame(() => {
          perfTrace('Runtime', 'rAF after setState (response settled)', {
            requestId: reqId,
          });
        });
      }
      const vs = result.validationSummary;
      perfTrace('Runtime', 'settled payload publication executed', {
        requestId: reqId,
        committedResponseTextLength: committedText.length,
        cardsCount: vs.cards?.length ?? 0,
        rulesCount: vs.rules?.length ?? 0,
        hasValidationSummary: vs != null,
      });
    }
    if (!firstChunkSent) {
      logInfo('AgentOrchestrator', 'first token received', {
        requestId: reqId,
      });
      listenersRef.current?.onFirstToken?.();
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
    listenersRef.current?.onComplete?.();
    const validationEndedAt = Date.now();
    perfTrace('AgentOrchestrator', 'validation end', { requestId: reqId });
    const settlingStartedAt = validationEndedAt;
    perfTrace('Runtime', 'settlement control state decision', {
      requestId: reqId,
      skipSettlementControlState: DIAG_SKIP_SETTLEMENT_CONTROL_STATE,
      op: 'processingSubstate_settling',
    });
    if (DIAG_SKIP_SETTLEMENT_CONTROL_STATE) {
      perfTrace('Runtime', 'skipped settlement control state', {
        requestId: reqId,
        op: 'processingSubstate_settling',
      });
    } else {
      setProcessingSubstate('settling');
    }
    perfTrace('AgentOrchestrator', 'settling start', { requestId: reqId });
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
    perfTrace('AgentOrchestrator', 'settling end', { requestId: reqId });
    traceResponseSurfaceSettledEvent(reqId, 'response_settled', () => {
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
      logInfo('ResponseSurface', 'response_settled', {
        requestId: reqId,
        lifecycle: 'processing',
        processingSubstate: 'settling',
        committedChars: committedText.length,
        rulesCount: result.validationSummary.rules.length,
        cardsCount: result.validationSummary.cards.length,
      });
    });
    traceResponseSurfaceSettledEvent(reqId, 'response_settled_payload', () => {
      logInfo('ResponseSurface', 'response_settled_payload', {
        requestId: reqId,
        committedResponseText: committedText,
        ...summarizeValidationSummary(result.validationSummary),
      });
    });
    previousCommittedResponseRef.current = null;
    previousCommittedValidationRef.current = null;
    return {
      status: 'completed',
      committedText,
      validationSummary: result.validationSummary,
      shouldPlay: committedText.length > 0 && !isEmptyOutput,
    };
  } catch (e) {
    const msg = errorMessage(e);
    const code =
      e && typeof e === 'object' && 'code' in e
        ? (e as { code: string }).code
        : '';
    const failureClassification = classifyTerminalFailure(e);
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
      });
      const requestFailurePayload = {
        requestId: reqId,
        message: displayMsg,
        failureKind: failureClassification.kind,
        failureStage: failureClassification.stage,
        failureReason: failureClassification.telemetryReason,
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
