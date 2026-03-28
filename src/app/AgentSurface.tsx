/**
 * AgentSurface: top-level composition root for the agent experience.
 * Composes VisualizationSurface, ResultsOverlay, InteractionBand, telemetry overlay.
 * Feeds normalized agent state into VisualizationController and ResultsOverlay.
 * Does not own provider/runtime logic; that lives in AgentOrchestrator.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SemanticChannelView } from '../screens';
import {
  cleanupEarcons,
  playListeningEndEarcon,
  playListeningStartEarcon,
  prepareEarcons,
} from '../shared/feedback/earcons';
import {
  triggerListeningEndHaptic,
  triggerListeningStartHaptic,
} from '../shared/feedback/haptics';
import { logInfo } from '../shared/logging';
import {
  dummyAnswer,
  dummyCards,
  dummyRules,
} from '../shared/stubs/demoResults';
import { getTheme } from '../theme';
import type {
  VisualizationPanelRects,
  VisualizationSignalEvent,
} from '../visualization';
import {
  createDefaultVisualizationRef,
  getSceneDescription,
  InteractionBand,
  setVisualizationScene,
  VisualizationSurface,
} from '../visualization';
import {
  getPlayActAccessibilityLabel,
  getPlayActPhaseCaptionText,
  getState as getRequestDebugState,
  emit as requestDebugEmit,
  resolveAgentPlayAct,
  subscribe as subscribeRequestDebug,
  useAgentOrchestrator,
  useVisualizationController,
  type RequestDebugState,
} from './agent';
import { useVisualizationSignals } from './hooks/useVisualizationSignals';
import {
  PipelineTelemetryPanel,
  ResultsOverlay,
  SemanticChannelLoadingView,
  VizDebugPanel,
  type ResultsOverlayRevealedBlocks,
} from './ui';
import {
  resetVizSubsystems,
  setVizSubsystem,
} from './ui/components/overlays/vizSubsystemToggles';
import { isLogGateEnabled } from '../shared/logging';

const DEBUG_ENABLED_DEFAULT = false;
const DEBUG_SCENARIO = false;
const SHOW_REVEAL_CHIPS = false;
const SHOW_HOLD_TO_SPEAK = false;
const DOUBLE_TAP_MS = 280;
const ASK_HOLD_MS = 400;
/** Max recording duration for hold-to-speak; timeout triggers stop + submit (same as release). */
const MAX_RECORDING_DURATION_MS = 12000;
const DEBUG_DISABLE_PROCESSING = false;
/** Stage 2 visible caption: default off (Stage 1 a11y-only). Enable only under docs/PLAY_ACT_BOUNDARIES.md Stage 2 decision rule. */
const PLAY_ACT_PHASE_CAPTION_ENABLED = false;
const DEBUG_LOG_SCOPES: Array<import('../shared/logging').LogScope> = [
  'AgentOrchestrator',
  'Interaction',
  'AgentSurface',
];

/** Interaction ownership: one owner wins by priority (debug > overlay > holdToSpeak > swipeContext > playbackTap > none). none = no owner holds exclusive interaction. */
type ActiveInteractionOwner =
  | 'none'
  | 'holdToSpeak'
  | 'swipeContext'
  | 'playbackTap'
  | 'overlay'
  | 'debug';

export default function AgentSurface() {
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  const theme = getTheme(isDarkMode);
  const textColor = theme.text;
  const mutedColor = theme.textMuted;
  const inputBg = theme.surface;
  const borderColor = theme.border;

  const visualizationRef = useRef(
    (() => {
      const r = createDefaultVisualizationRef();
      setVisualizationScene(r, getSceneDescription());
      return r;
    })(),
  );
  const listenersRef = useRef<
    import('./agent').AgentOrchestratorListeners | null
  >(null);
  const requestDebugSinkRef = useRef<import('./agent').RequestDebugSink | null>(
    function requestDebugSinkWrapper(
      payload: Parameters<import('./agent').RequestDebugSink>[0],
    ) {
      if (!isLogGateEnabled('requestDebug')) return;
      requestDebugEmit(payload);
    },
  );
  const orch = useAgentOrchestrator({ listenersRef, requestDebugSinkRef });
  const { state: orchState, actions: orchActions } = orch;

  const [requestDebugState, setRequestDebugState] =
    useState<RequestDebugState>(getRequestDebugState);
  useEffect(() => {
    return subscribeRequestDebug(() =>
      setRequestDebugState(getRequestDebugState()),
    );
  }, []);

  const [debugPanelMode, setDebugPanelMode] = useState<
    'off' | 'telemetry' | 'viz'
  >(DEBUG_ENABLED_DEFAULT ? 'viz' : 'off');
  const debugEnabled = debugPanelMode !== 'off';
  const [debugStubCardsEnabled, setDebugStubCardsEnabled] = useState(false);
  const [debugStubRulesEnabled, setDebugStubRulesEnabled] = useState(false);
  const [telemetryLayout, setTelemetryLayout] = useState({
    width: 0,
    height: 0,
  });
  const [revealedBlocks, setRevealedBlocks] =
    useState<ResultsOverlayRevealedBlocks>({
      answer: false,
      cards: false,
      rules: false,
      sources: false,
    });

  const handleTelemetryClose = useCallback(() => {
    const activeId = requestDebugState.activeRequestId;
    let snapshot =
      activeId != null
        ? requestDebugState.snapshotsById.get(activeId) ?? null
        : null;
    if (!snapshot && requestDebugState.recentRequestIds.length > 0) {
      const lastId =
        requestDebugState.recentRequestIds[
          requestDebugState.recentRequestIds.length - 1
        ];
      snapshot = requestDebugState.snapshotsById.get(lastId) ?? null;
    }
    if (snapshot) {
      logInfo('AgentSurface', 'telemetry panel closed', {
        requestId: snapshot.requestId,
        status: snapshot.status,
        lifecycle: orchState.lifecycle,
        processingSubstate: orchState.processingSubstate ?? null,
        snapshotLifecycle: snapshot.lifecycle,
        snapshotProcessingSubstate: snapshot.processingSubstate ?? null,
        failureReason: snapshot.failureReason ?? null,
        durations: snapshot.durations ?? null,
        cards: snapshot.validationSummary?.cards.length ?? 0,
        rules: snapshot.validationSummary?.rules.length ?? 0,
        modelInfo: snapshot.modelInfo ?? null,
      });
    } else {
      logInfo('AgentSurface', 'telemetry panel closed (no snapshot)');
    }
    setDebugPanelMode('off');
  }, [orchState.lifecycle, orchState.processingSubstate, requestDebugState]);

  const { setSignals, emitEvent } = useVisualizationSignals(visualizationRef);
  useVisualizationController(visualizationRef, orchState, listenersRef, {
    debugEnabled,
    debugScenario: DEBUG_SCENARIO,
  });

  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    const g = globalThis as Record<string, unknown>;
    g.setVizSubsystem = setVizSubsystem;
    g.resetVizSubsystems = resetVizSubsystems;
    if (!g.__ATLAS_LOG_GATES__) {
      g.__ATLAS_LOG_GATES__ = {
        settlementPayload: true,
        playbackHandoff: true,
        requestDebug: true,
        ragVerbose: true,
        vizRuntime: true,
      };
    }
    g.disableHotPathLogs = () => {
      const gates = g.__ATLAS_LOG_GATES__ as Record<string, boolean>;
      gates.settlementPayload = false;
      gates.playbackHandoff = false;
    };
    g.enableAllLogs = () => {
      const gates = g.__ATLAS_LOG_GATES__ as Record<string, boolean>;
      Object.keys(gates).forEach(key => {
        gates[key] = true;
      });
    };
  }, []);

  useEffect(() => {
    logInfo('AgentSurface', 'mounted as active composition root');
    if (typeof globalThis !== 'undefined') {
      (globalThis as { __LOG_SCOPES__?: string[] }).__LOG_SCOPES__ =
        DEBUG_LOG_SCOPES;
      (
        globalThis as { __DISABLE_IOS_EARCON_START__?: boolean }
      ).__DISABLE_IOS_EARCON_START__ = true;
    }
    prepareEarcons().catch(() => {});
  }, []);

  const scrollYRef = useRef(0);
  const panelRectsContentRef = useRef<VisualizationPanelRects>({});
  const lastTapAtRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userModeLongPressActiveRef = useRef(false);
  const askHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const releaseGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const centerHoldActiveRef = useRef(false);
  const holdCompletionInFlightRef = useRef(false);
  const holdStartPromiseRef = useRef<Promise<{
    ok: boolean;
    reason?: string;
  }> | null>(null);
  const submitTriggeredForReleaseRef = useRef(false);
  const releaseReasonRef = useRef<
    'hold release' | 'hold release delayed' | 'timeout' | null
  >(null);
  const submitRef = useRef<(() => Promise<string | null>) | null>(null);

  const panelRectsLoggedRef = useRef(false);
  const flushPanelRects = useCallback(() => {
    const next: VisualizationPanelRects = {};
    const source = panelRectsContentRef.current;
    const keys: Array<keyof VisualizationPanelRects> = [
      'answer',
      'cards',
      'rules',
    ];
    for (const key of keys) {
      const rect = source[key];
      if (!rect || rect.w <= 0 || rect.h <= 0) continue;
      next[key] = {
        x: rect.x,
        y: rect.y - scrollYRef.current,
        w: rect.w,
        h: rect.h,
      };
    }
    setSignals({ panelRects: next });
    if (Object.keys(next).length > 0 && !panelRectsLoggedRef.current) {
      panelRectsLoggedRef.current = true;
      logInfo('ResultsOverlay', 'panel rects first reported');
    }
  }, [setSignals]);

  const updatePanelRect = useCallback(
    (
      key: keyof VisualizationPanelRects,
      rect: { x: number; y: number; w: number; h: number },
    ) => {
      panelRectsContentRef.current = {
        ...panelRectsContentRef.current,
        [key]: rect,
      };
      flushPanelRects();
    },
    [flushPanelRects],
  );

  const clearPanelRect = useCallback(
    (key: keyof VisualizationPanelRects) => {
      const next = { ...panelRectsContentRef.current };
      delete next[key];
      panelRectsContentRef.current = next;
      flushPanelRects();
    },
    [flushPanelRects],
  );

  const handleOverlayScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollYRef.current = e.nativeEvent.contentOffset.y;
      flushPanelRects();
    },
    [flushPanelRects],
  );

  const handleSubmit = useCallback(async (): Promise<string | null> => {
    if (DEBUG_SCENARIO) {
      const dummySignals = {
        phase: 'resolved' as 'idle' | 'processing' | 'resolved',
        grounded: true,
        confidence: 0.82,
        retrievalDepth: 3,
        cardRefsCount: 2,
        event: null as VisualizationSignalEvent,
      };
      if (debugEnabled) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit phase for debug
        const { phase: _p, ...rest } = dummySignals;
        setSignals(rest);
      } else {
        setSignals(dummySignals);
      }
      return null;
    }
    if (DEBUG_DISABLE_PROCESSING) {
      logInfo(
        'AgentSurface',
        'submit skipped: processing disabled for speech debug',
      );
      return null;
    }
    return orchActions.submit();
  }, [orchActions, setSignals, debugEnabled]);
  submitRef.current = handleSubmit;

  const clearRecordingTimeout = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  }, []);

  const playListeningStartFeedback = useCallback(() => {
    playListeningStartEarcon();
    triggerListeningStartHaptic();
    logInfo('Interaction', 'listening started');
  }, []);

  const playListeningEndFeedback = useCallback(
    (reason: 'hold release' | 'hold release delayed' | 'timeout') => {
      playListeningEndEarcon();
      triggerListeningEndHaptic();
      logInfo('Interaction', 'listening stopped');
      logInfo(
        'Interaction',
        reason === 'timeout'
          ? 'submit triggered from recording timeout'
          : reason === 'hold release delayed'
          ? 'submit triggered from delayed hold release'
          : 'submit triggered from hold release',
      );
    },
    [],
  );

  useEffect(() => {
    const current = listenersRef.current;
    if (!current) return;
    const wrapped = {
      ...current,
      onTranscriptReadyForSubmit: () => {
        playListeningEndFeedback(releaseReasonRef.current ?? 'hold release');
        if (!submitTriggeredForReleaseRef.current) {
          submitTriggeredForReleaseRef.current = true;
          submitRef.current?.().catch(() => {});
        }
      },
      onListeningEnd: () => {
        current.onListeningEnd?.();
        clearRecordingTimeout();
        if (releaseGraceTimerRef.current) {
          clearTimeout(releaseGraceTimerRef.current);
          releaseGraceTimerRef.current = null;
        }
      },
      onError: (reason?: string, details?: Record<string, unknown>) => {
        current.onError?.(reason, details);
        clearRecordingTimeout();
        if (releaseGraceTimerRef.current) {
          clearTimeout(releaseGraceTimerRef.current);
          releaseGraceTimerRef.current = null;
        }
      },
    };
    listenersRef.current = wrapped;
    return () => {
      if (listenersRef.current === wrapped) {
        listenersRef.current = current;
      }
    };
  }, [clearRecordingTimeout, playListeningEndFeedback]);

  const stubCards = debugStubCardsEnabled ? dummyCards : [];
  const stubRules = debugStubRulesEnabled ? dummyRules : [];
  const hasReferenceStubs = stubCards.length > 0 || stubRules.length > 0;
  const hasResultContext =
    orchState.lifecycle === 'listening' ||
    orchState.lifecycle === 'processing' ||
    orchState.lifecycle === 'speaking' ||
    orchState.responseText != null ||
    orchState.validationSummary != null;
  const showContentPanels =
    hasResultContext ||
    hasReferenceStubs ||
    (orchState.error != null && orchState.lifecycle === 'error');
  const cardsCount =
    orchState.validationSummary?.cards?.length ?? stubCards.length;
  const rulesCount =
    orchState.validationSummary?.rules?.length ?? stubRules.length;
  const anyPanelVisible =
    revealedBlocks.answer ||
    revealedBlocks.cards ||
    revealedBlocks.rules ||
    revealedBlocks.sources;
  const canRevealPanels =
    DEBUG_SCENARIO || hasResultContext || hasReferenceStubs;
  const isAsking = orchState.lifecycle === 'processing';
  const interactionBandEnabled =
    !debugEnabled && !anyPanelVisible && orchState.lifecycle !== 'processing';

  const playActResolution = useMemo(
    () =>
      resolveAgentPlayAct(orchState, {
        interactionBandEnabled,
      }),
    [orchState, interactionBandEnabled],
  );

  const playActAccessibilityLabel = useMemo(
    () => getPlayActAccessibilityLabel(playActResolution, orchState),
    [playActResolution, orchState],
  );

  const playActPhaseCaption = useMemo(() => {
    if (!PLAY_ACT_PHASE_CAPTION_ENABLED) return null;
    return getPlayActPhaseCaptionText(playActResolution, orchState);
  }, [playActResolution, orchState]);

  const canHoldToSpeak = !isAsking && !anyPanelVisible && !debugEnabled;
  const canSwipeContext = canRevealPanels && interactionBandEnabled;
  const activeInteractionOwner: ActiveInteractionOwner = debugEnabled
    ? 'debug'
    : anyPanelVisible
    ? 'overlay'
    : orchState.lifecycle === 'listening'
    ? 'holdToSpeak'
    : canRevealPanels &&
      (orchState.lifecycle === 'idle' || orchState.lifecycle === 'error')
    ? 'swipeContext'
    : orchState.lifecycle === 'speaking'
    ? 'playbackTap'
    : 'none';

  const prevInteractionOwnerRef = useRef<ActiveInteractionOwner>(
    activeInteractionOwner,
  );
  useEffect(() => {
    if (prevInteractionOwnerRef.current !== activeInteractionOwner) {
      logInfo('Interaction', 'interaction owner change', {
        from: prevInteractionOwnerRef.current,
        to: activeInteractionOwner,
      });
      prevInteractionOwnerRef.current = activeInteractionOwner;
    }
  }, [activeInteractionOwner]);

  const stopListeningAndSubmit = useCallback(
    async (reason: 'hold release' | 'hold release delayed' | 'timeout') => {
      if (holdCompletionInFlightRef.current) return;
      holdCompletionInFlightRef.current = true;
      centerHoldActiveRef.current = false;
      userModeLongPressActiveRef.current = false;
      releaseReasonRef.current = reason;
      clearRecordingTimeout();
      try {
        const startPromise = holdStartPromiseRef.current;
        if (startPromise) {
          const result = await startPromise;
          if (!result.ok) return;
        }
        // Always request stop after a successful start; orchestrator owns whether to act.
        // Avoids losing a quick release when local snapshot is still "starting".
        await orchActions.stopListeningAndRequestSubmit();
        // Listening stopped / submit triggered logs and feedback run after settlement in onTranscriptReadyForSubmit.
      } finally {
        holdStartPromiseRef.current = null;
        holdCompletionInFlightRef.current = false;
      }
    },
    [clearRecordingTimeout, orchActions],
  );

  const handleCenterHoldAttempt = useCallback(
    (reportAccepted: (accepted: boolean) => void) => {
      const reportRecoverableInteractionFailure = (
        interactionReason: string,
        details?: Record<string, unknown>,
      ) => {
        orchActions.reportRecoverableFailure('interactionRejected', {
          ...details,
          interactionReason,
        });
      };
      if (holdCompletionInFlightRef.current) {
        reportAccepted(false);
        reportRecoverableInteractionFailure('holdCompletionInFlight');
        return;
      }
      if (!canHoldToSpeak) {
        logInfo('Interaction', 'hold blocked', {
          reason: isAsking
            ? 'active request'
            : anyPanelVisible
            ? 'overlay'
            : debugEnabled
            ? 'debug'
            : 'unknown',
        });
        reportAccepted(false);
        reportRecoverableInteractionFailure('holdBlocked', {
          blockedBy: isAsking
            ? 'active request'
            : anyPanelVisible
            ? 'overlay'
            : debugEnabled
            ? 'debug'
            : 'unknown',
        });
        return;
      }
      if (orchState.audioSessionState !== 'idleReady') {
        reportAccepted(false);
        reportRecoverableInteractionFailure('audioNotIdleReady', {
          audioSessionState: orchState.audioSessionState,
        });
        return;
      }
      logInfo('Interaction', 'hold attempt detected', { tMs: Date.now() });
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapAtRef.current = 0;
      submitTriggeredForReleaseRef.current = false;
      clearRecordingTimeout();
      (async () => {
        playListeningStartFeedback();
        const startPromise = orchActions.startListening(true);
        holdStartPromiseRef.current = startPromise;
        const result = await startPromise;
        if (holdStartPromiseRef.current === startPromise) {
          holdStartPromiseRef.current = null;
        }
        if (!result.ok) {
          reportAccepted(false);
          reportRecoverableInteractionFailure('startListeningRejected', {
            startReason: result.reason ?? 'unknown',
          });
          return;
        }
        centerHoldActiveRef.current = true;
        reportAccepted(true);
        if (!centerHoldActiveRef.current || holdCompletionInFlightRef.current)
          return;
        recordingTimeoutRef.current = setTimeout(() => {
          recordingTimeoutRef.current = null;
          if (!centerHoldActiveRef.current || holdCompletionInFlightRef.current)
            return;
          logInfo('Interaction', 'recording timeout reached');
          stopListeningAndSubmit('timeout').catch(() => {});
        }, MAX_RECORDING_DURATION_MS);
      })().catch(() => {
        centerHoldActiveRef.current = false;
        holdStartPromiseRef.current = null;
        reportAccepted(false);
        reportRecoverableInteractionFailure('startListeningThrew');
      });
    },
    [
      canHoldToSpeak,
      isAsking,
      anyPanelVisible,
      debugEnabled,
      orchState.audioSessionState,
      orchActions,
      clearRecordingTimeout,
      stopListeningAndSubmit,
      playListeningStartFeedback,
    ],
  );

  const handleCenterHoldEnd = useCallback(() => {
    if (holdCompletionInFlightRef.current) return;

    // If we're not active but there is a pending start promise, it means the user
    // released while startListening was still resolving. We must wait for it to
    // finish and then immediately stop to prevent a dangling recording session.
    if (!centerHoldActiveRef.current) {
      if (holdStartPromiseRef.current) {
        logInfo(
          'Interaction',
          'center hold end detected during start resolution',
        );
        const pendingPromise = holdStartPromiseRef.current;
        holdStartPromiseRef.current = null;
        pendingPromise
          .then(result => {
            if (result.ok) {
              stopListeningAndSubmit('hold release delayed').catch(() => {});
            }
          })
          .catch(() => {});
      }
      return;
    }

    logInfo('Interaction', 'center hold end detected');
    clearRecordingTimeout();
    if (releaseGraceTimerRef.current) {
      clearTimeout(releaseGraceTimerRef.current);
      releaseGraceTimerRef.current = null;
    }
    stopListeningAndSubmit('hold release').catch(() => {});
  }, [clearRecordingTimeout, stopListeningAndSubmit]);

  const handleUserModeTap = useCallback(() => {
    if (
      orchState.lifecycle === 'processing' ||
      orchState.lifecycle === 'listening'
    ) {
      return;
    }
    const now = Date.now();
    const sinceLast = now - lastTapAtRef.current;
    if (sinceLast > 0 && sinceLast <= DOUBLE_TAP_MS) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapAtRef.current = 0;
      const answer = (orchState.responseText ?? '').trim();
      if (answer) orchActions.playText(answer);
      return;
    }
    lastTapAtRef.current = now;
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      orchActions.cancelPlayback();
    }, DOUBLE_TAP_MS + 20);
  }, [orchState.lifecycle, orchState.responseText, orchActions]);

  const handleUserModeLongPressStart = useCallback(() => {
    if (holdCompletionInFlightRef.current) return;
    if (!canHoldToSpeak) {
      logInfo('Interaction', 'hold blocked', {
        reason: isAsking
          ? 'active request'
          : anyPanelVisible
          ? 'overlay'
          : debugEnabled
          ? 'debug'
          : 'unknown',
      });
      return;
    }
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
    lastTapAtRef.current = 0;
    submitTriggeredForReleaseRef.current = false;
    userModeLongPressActiveRef.current = true;
    clearRecordingTimeout();
    (async () => {
      playListeningStartFeedback();
      const startPromise = orchActions.startListening(true);
      holdStartPromiseRef.current = startPromise;
      const result = await startPromise;
      if (holdStartPromiseRef.current === startPromise) {
        holdStartPromiseRef.current = null;
      }
      if (!result.ok) {
        userModeLongPressActiveRef.current = false;
        orchActions.reportRecoverableFailure('interactionRejected', {
          interactionReason: 'userModeStartRejected',
          startReason: result.reason ?? 'unknown',
        });
        return;
      }
      if (
        !userModeLongPressActiveRef.current ||
        holdCompletionInFlightRef.current
      )
        return;
      recordingTimeoutRef.current = setTimeout(() => {
        recordingTimeoutRef.current = null;
        if (
          !userModeLongPressActiveRef.current ||
          holdCompletionInFlightRef.current
        )
          return;
        logInfo('Interaction', 'recording timeout reached');
        stopListeningAndSubmit('timeout').catch(() => {});
      }, MAX_RECORDING_DURATION_MS);
    })().catch(() => {
      userModeLongPressActiveRef.current = false;
      holdStartPromiseRef.current = null;
    });
  }, [
    canHoldToSpeak,
    isAsking,
    anyPanelVisible,
    debugEnabled,
    orchActions,
    clearRecordingTimeout,
    stopListeningAndSubmit,
    playListeningStartFeedback,
  ]);

  const handleUserModeLongPressEnd = useCallback(() => {
    if (
      !userModeLongPressActiveRef.current ||
      holdCompletionInFlightRef.current
    )
      return;
    clearRecordingTimeout();
    if (releaseGraceTimerRef.current) {
      clearTimeout(releaseGraceTimerRef.current);
      releaseGraceTimerRef.current = null;
    }
    stopListeningAndSubmit('hold release').catch(() => {});
  }, [clearRecordingTimeout, stopListeningAndSubmit]);

  const handleAskPressIn = useCallback(() => {
    if (askHoldTimerRef.current) clearTimeout(askHoldTimerRef.current);
    askHoldTimerRef.current = setTimeout(() => {
      askHoldTimerRef.current = null;
      handleUserModeLongPressStart();
    }, ASK_HOLD_MS);
  }, [handleUserModeLongPressStart]);

  const handleAskPressOut = useCallback(() => {
    if (userModeLongPressActiveRef.current) {
      handleUserModeLongPressEnd();
    } else if (askHoldTimerRef.current) {
      clearTimeout(askHoldTimerRef.current);
      askHoldTimerRef.current = null;
    }
  }, [handleUserModeLongPressEnd]);

  const handleClusterTap = useCallback(
    (cluster: 'rules' | 'cards') => {
      if (!canSwipeContext) {
        return;
      }
      if (cluster === 'rules') {
        setRevealedBlocks({
          answer: false,
          cards: false,
          rules: true,
          sources: false,
        });
        emitEvent('tapCitation');
      } else {
        setRevealedBlocks({
          answer: false,
          cards: true,
          rules: false,
          sources: false,
        });
        emitEvent('tapCard');
      }
    },
    [canSwipeContext, emitEvent],
  );

  const revealBlock = useCallback(
    (key: keyof ResultsOverlayRevealedBlocks) => {
      setRevealedBlocks(prev => ({ ...prev, [key]: true }));
      const requestId =
        requestDebugState.activeRequestId ??
        (requestDebugState.recentRequestIds.length > 0
          ? requestDebugState.recentRequestIds[
              requestDebugState.recentRequestIds.length - 1
            ]
          : null);
      logInfo('ResponseSurface', 'response_surface_revealed_by_user', {
        requestId: requestId ?? undefined,
        lifecycle: orchState.lifecycle,
        reason: 'userReveal',
      });
    },
    [
      orchState.lifecycle,
      requestDebugState.activeRequestId,
      requestDebugState.recentRequestIds,
    ],
  );

  const clearHoldInteractionState = useCallback(() => {
    clearRecordingTimeout();
    if (releaseGraceTimerRef.current) {
      clearTimeout(releaseGraceTimerRef.current);
      releaseGraceTimerRef.current = null;
    }
    centerHoldActiveRef.current = false;
    userModeLongPressActiveRef.current = false;
    holdCompletionInFlightRef.current = false;
    holdStartPromiseRef.current = null;
  }, [clearRecordingTimeout]);

  const resetInteractionSurface = useCallback(() => {
    clearHoldInteractionState();
    setRevealedBlocks({
      answer: false,
      cards: false,
      rules: false,
      sources: false,
    });
  }, [clearHoldInteractionState]);

  const handleClearError = useCallback(() => {
    orchActions.recoverFromRequestFailure();
    resetInteractionSurface();
  }, [orchActions, resetInteractionSurface]);

  useEffect(() => {
    if (orchState.lifecycle !== 'listening') {
      clearRecordingTimeout();
    }
  }, [orchState.lifecycle, clearRecordingTimeout]);

  useEffect(() => {
    if (!canRevealPanels) {
      setRevealedBlocks({
        answer: false,
        cards: false,
        rules: false,
        sources: false,
      });
    }
  }, [canRevealPanels]);

  useEffect(() => {
    if (orchState.error == null) return;
    resetInteractionSurface();
  }, [orchState.error, resetInteractionSurface]);

  const prevLifecycleRef = useRef(orchState.lifecycle);
  useEffect(() => {
    const prev = prevLifecycleRef.current;
    const next = orchState.lifecycle;
    prevLifecycleRef.current = next;
    if (prev === 'speaking' && next === 'idle') {
      setRevealedBlocks({
        answer: false,
        cards: false,
        rules: false,
        sources: false,
      });
    }
    if (prev !== 'processing' && next === 'processing') {
      setRevealedBlocks({
        answer: false,
        cards: false,
        rules: false,
        sources: false,
      });
    }
  }, [orchState.lifecycle]);

  useEffect(() => {
    if (cardsCount === 0 || !revealedBlocks.cards) clearPanelRect('cards');
    if (rulesCount === 0 || !revealedBlocks.rules) clearPanelRect('rules');
    if (!canRevealPanels || !revealedBlocks.answer) clearPanelRect('answer');
  }, [
    cardsCount,
    rulesCount,
    canRevealPanels,
    revealedBlocks.answer,
    revealedBlocks.cards,
    revealedBlocks.rules,
    clearPanelRect,
  ]);

  useEffect(() => {
    const setReduceMotion = (enabled: boolean) => {
      if (visualizationRef.current)
        visualizationRef.current.reduceMotion = enabled;
    };
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      logInfo(
        'AgentSurface',
        `[Lifecycle] AppState changed to ${nextAppState}`,
      );
      if (visualizationRef.current) {
        visualizationRef.current.appState = nextAppState;
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      clearHoldInteractionState();
      cleanupEarcons();
    };
  }, [clearHoldInteractionState]);

  if (!orchState.voiceReady && !orchState.error) {
    return (
      <SemanticChannelLoadingView
        theme={getTheme(true)}
        paddingTop={insets.top}
      />
    );
  }

  const holdToSpeakSlot = SHOW_HOLD_TO_SPEAK ? (
    <Pressable
      style={[
        localStyles.askTrigger,
        { borderColor, backgroundColor: inputBg },
      ]}
      onPressIn={handleAskPressIn}
      onPressOut={handleAskPressOut}
      onPress={handleUserModeTap}
    >
      <Text style={[localStyles.askTriggerLabel, { color: textColor }]}>
        Hold to speak, release to ask
      </Text>
      <Text style={[localStyles.askTriggerHint, { color: mutedColor }]}>
        Tap to play answer or cancel
      </Text>
    </Pressable>
  ) : null;

  return (
    <View style={localStyles.screenWrapper}>
      {/*
        Shell: canvas is non-interactive (pointerEvents="none"); do not pass direct-mount canvas
        callbacks — they never fire here. Playback tap / double-tap: ask Pressable; hold-to-speak:
        InteractionBand + Pressable ask slot. Cluster release: InteractionBand only.
      */}
      <VisualizationSurface
        visualizationRef={visualizationRef}
        controlsEnabled={debugEnabled}
        inputEnabled
        clusterZoneHighlights={!debugEnabled && !anyPanelVisible}
        canvasBackground={theme.viz.canvasBackground}
      >
        <SemanticChannelView
          contentPaddingTop={insets.top}
          contentPaddingBottom={insets.bottom}
          onScroll={handleOverlayScroll}
          accessibilityContainerLabel={playActAccessibilityLabel}
          phaseCaptionText={playActPhaseCaption}
          phaseCaptionColor={mutedColor}
        >
          <ResultsOverlay
            responseText={orchState.responseText}
            validationSummary={orchState.validationSummary}
            error={orchState.lifecycle === 'error' ? orchState.error : null}
            onClearError={handleClearError}
            isAsking={isAsking}
            processingSubstate={orchState.processingSubstate ?? null}
            revealedBlocks={revealedBlocks}
            revealBlock={revealBlock}
            setRevealedBlocks={setRevealedBlocks}
            updatePanelRect={updatePanelRect}
            clearPanelRect={clearPanelRect}
            theme={{
              text: textColor,
              textMuted: mutedColor,
              background: theme.background,
              border: borderColor,
              primary: theme.primary,
              warning: theme.warning,
            }}
            intensity={visualizationRef.current?.vizIntensity ?? 'subtle'}
            reduceMotion={visualizationRef.current?.reduceMotion ?? false}
            emitEvent={emitEvent}
            showContentPanels={!!(DEBUG_SCENARIO || showContentPanels)}
            canRevealPanels={canRevealPanels}
            debugScenario={DEBUG_SCENARIO}
            dummyAnswer={dummyAnswer}
            dummyCards={dummyCards}
            dummyRules={dummyRules}
            stubCards={stubCards}
            stubRules={stubRules}
            showRevealChips={SHOW_REVEAL_CHIPS}
            holdToSpeakSlot={holdToSpeakSlot}
          />
        </SemanticChannelView>
      </VisualizationSurface>
      <InteractionBand
        visualizationRef={visualizationRef}
        onClusterRelease={handleClusterTap}
        onCenterHoldAttempt={
          !debugEnabled ? handleCenterHoldAttempt : undefined
        }
        onCenterHoldEnd={!debugEnabled ? handleCenterHoldEnd : undefined}
        onCenterHoldShortTap={
          !debugEnabled ? () => emitEvent('shortTap') : undefined
        }
        enabled={interactionBandEnabled}
        blocked={orchState.ioBlockedUntil != null}
        blockedUntil={orchState.ioBlockedUntil ?? null}
        centerHoldShouldBypassDelay={
          orchState.audioSessionState !== 'idleReady'
        }
      />
      {debugPanelMode !== 'off' && (
        <View
          style={[
            localStyles.telemetryOverlay,
            {
              paddingTop: (insets.top || 0) + 8,
              paddingBottom: (insets.bottom || 0) + 8,
            },
          ]}
          pointerEvents="box-none"
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            setTelemetryLayout({ width, height });
          }}
        >
          <View style={localStyles.telemetryPanelWrap}>
            {debugPanelMode === 'telemetry' && (
              <PipelineTelemetryPanel
                state={requestDebugState}
                onClose={handleTelemetryClose}
                maxHeight={
                  telemetryLayout.height > 0
                    ? telemetryLayout.height -
                      ((insets.top || 0) + (insets.bottom || 0) + 16)
                    : Dimensions.get('window').height -
                      ((insets.top || 0) + (insets.bottom || 0) + 16)
                }
                maxWidth={
                  telemetryLayout.width > 0
                    ? telemetryLayout.width - 32
                    : Dimensions.get('window').width - 32
                }
              />
            )}
            {debugPanelMode === 'viz' && (
              <VizDebugPanel
                visualizationRef={visualizationRef}
                onClose={() => setDebugPanelMode('off')}
                stubCardsEnabled={debugStubCardsEnabled}
                stubRulesEnabled={debugStubRulesEnabled}
                onToggleStubCards={() =>
                  setDebugStubCardsEnabled(prev => !prev)
                }
                onToggleStubRules={() =>
                  setDebugStubRulesEnabled(prev => !prev)
                }
                maxHeight={
                  telemetryLayout.height > 0
                    ? telemetryLayout.height -
                      ((insets.top || 0) + (insets.bottom || 0) + 16)
                    : Dimensions.get('window').height -
                      ((insets.top || 0) + (insets.bottom || 0) + 16)
                }
                maxWidth={
                  telemetryLayout.width > 0
                    ? telemetryLayout.width - 32
                    : Dimensions.get('window').width - 32
                }
              />
            )}
          </View>
        </View>
      )}
      <Pressable
        style={[localStyles.devToggle, { bottom: (insets.bottom || 16) + 92 }]}
        hitSlop={10}
        onPress={() =>
          setDebugPanelMode(prev =>
            prev === 'off' ? 'telemetry' : prev === 'telemetry' ? 'viz' : 'off',
          )
        }
      >
        <Text style={localStyles.devToggleLabel}>
          {debugPanelMode === 'off'
            ? 'Dev'
            : debugPanelMode === 'telemetry'
            ? 'Telemetry'
            : 'Viz'}
        </Text>
      </Pressable>
    </View>
  );
}

const localStyles = StyleSheet.create({
  screenWrapper: { flex: 1 },
  askTrigger: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  askTriggerLabel: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  askTriggerHint: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    fontWeight: '500',
  },
  devToggle: {
    position: 'absolute',
    right: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 60,
    elevation: 60,
  },
  devToggleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  telemetryOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  telemetryPanelWrap: {
    alignSelf: 'center',
  },
});
