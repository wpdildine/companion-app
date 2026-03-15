/**
 * AgentSurface: top-level composition root for the agent experience.
 * Composes VisualizationSurface, ResultsOverlay, InteractionBand, telemetry overlay.
 * Feeds normalized agent state into VisualizationController and ResultsOverlay.
 * Does not own provider/runtime logic; that lives in AgentOrchestrator.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Dimensions, Modal, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { logInfo } from '../shared/logging';
import {
  cleanupEarcons,
  playListeningStartEarcon,
  playListeningEndEarcon,
  prepareEarcons,
} from '../shared/feedback/earcons';
import { triggerListeningStartHaptic, triggerListeningEndHaptic } from '../shared/feedback/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CardRef, SelectedRule } from './ui';
import { SemanticChannelView } from '../screens';
import { SemanticChannelLoadingView } from './ui';
import { getTheme } from '../theme';
import {
  createDefaultVisualizationRef,
  getSceneDescription,
  setVisualizationScene,
  VisualizationSurface,
  InteractionBand,
} from '../visualization';
import type {
  VisualizationPanelRects,
  VisualizationSignalEvent,
} from '../visualization';
import { TRANSIENT_SIGNAL_SOFT_FAIL } from '../visualization';
import { useVisualizationSignals } from './hooks/useVisualizationSignals';
import {
  useAgentOrchestrator,
  useVisualizationController,
  emit as requestDebugEmit,
  getState as getRequestDebugState,
  subscribe as subscribeRequestDebug,
  type RequestDebugState,
} from './agent';
import {
  ResultsOverlay,
  PipelineTelemetryPanel,
  VizDebugPanel,
  type ResultsOverlayRevealedBlocks,
} from './ui';
import {
  createBundlePackReader,
  createDocumentsPackReader,
  copyBundlePackToDocuments,
  getFileReader,
  getContentPackPathInDocuments,
  getPackState,
} from '../rag';
import {
  buildResolverIndex,
  useNameShapingController,
  useNameShapingState,
  useSpineNameShapingCapture,
  NameShapingTouchGuideOverlay,
  type ResolverIndex,
} from './nameShaping';
import {
  endNameShapingCommitTrace,
  getActiveNameShapingCommitTrace,
} from './nameShaping/runtime/nameShapingCommitTrace';

/** Set true to show NameShaping debug affordances by default; enabling capture remains manual in the Viz debug panel. */
const NAME_SHAPING_CAPTURE_DEBUG = false;
const NAME_SHAPING_VERBOSE_DEBUG_LOGS = false;
const NAME_SHAPING_VISUAL_DEBUG_ENABLED = true;
const DEBUG_ENABLED_DEFAULT = NAME_SHAPING_CAPTURE_DEBUG;
const DEBUG_SCENARIO = false;
const SHOW_REVEAL_CHIPS = false;
const SHOW_HOLD_TO_SPEAK = false;
const DOUBLE_TAP_MS = 280;
const ASK_HOLD_MS = 400;
/** Max recording duration for hold-to-speak; timeout triggers stop + submit (same as release). */
const MAX_RECORDING_DURATION_MS = 12000;
const DEBUG_DISABLE_PROCESSING = false;
const DEBUG_LOG_SCOPES: Array<import('../shared/logging').LogScope> = [
  'AgentOrchestrator',
  'Interaction',
  'AgentSurface',
  'NameShapingCapture',
];

/** Interaction ownership: one owner wins by priority (debug > overlay > holdToSpeak > swipeContext > playbackTap > none). none = no owner holds exclusive interaction. */
type ActiveInteractionOwner =
  | 'none'
  | 'holdToSpeak'
  | 'swipeContext'
  | 'playbackTap'
  | 'overlay'
  | 'debug';

const dummyAnswer = `
Blood Moon turns all nonbasic lands into Mountains.
This removes their abilities unless those abilities are intrinsic to being a Mountain.
Continuous effects are applied in layer 4 and layer 6 depending on the interaction.
`;

const dummyCards: CardRef[] = [
  {
    id: 'blood-moon',
    name: 'Blood Moon',
    imageUri: undefined,
    typeLine: 'Enchantment',
    manaCost: '{2}{R}',
    oracle: 'Nonbasic lands are Mountains.',
  },
  {
    id: 'urborg',
    name: 'Urborg, Tomb of Yawgmoth',
    imageUri: undefined,
    typeLine: 'Legendary Land',
    manaCost: '',
    oracle: 'Each land is a Swamp in addition to its other land types.',
  },
];

const dummyRules: SelectedRule[] = [
  {
    id: '613.1',
    title: 'Layer System',
    excerpt:
      'The values of objects are determined by applying continuous effects in a series of layers.',
    used: true,
  },
  {
    id: '305.7',
    title: 'Land Type Changing Effects',
    excerpt:
      "If an effect sets a land's subtype to one or more basic land types, the land loses all abilities and gains the corresponding mana abilities.",
    used: true,
  },
  {
    id: '604.1',
    title: 'Static Abilities',
    excerpt:
      'Static abilities do something all the time rather than being activated or triggered.',
    used: false,
  },
];

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
  const listenersRef = useRef<import('./agent').AgentOrchestratorListeners | null>(null);
  const requestDebugSinkRef = useRef<import('./agent').RequestDebugSink | null>(requestDebugEmit);
  const orch = useAgentOrchestrator({ listenersRef, requestDebugSinkRef });
  const { state: orchState, actions: orchActions } = orch;

  const [requestDebugState, setRequestDebugState] = useState<RequestDebugState>(getRequestDebugState);
  useEffect(() => {
    return subscribeRequestDebug(() => setRequestDebugState(getRequestDebugState()));
  }, []);

  const [debugPanelMode, setDebugPanelMode] = useState<'off' | 'telemetry' | 'viz'>(
    DEBUG_ENABLED_DEFAULT ? 'viz' : 'off',
  );
  const debugEnabled = debugPanelMode !== 'off';
  const [debugStubCardsEnabled, setDebugStubCardsEnabled] = useState(false);
  const [debugStubRulesEnabled, setDebugStubRulesEnabled] = useState(false);
  const [telemetryLayout, setTelemetryLayout] = useState({ width: 0, height: 0 });
  const [revealedBlocks, setRevealedBlocks] = useState<ResultsOverlayRevealedBlocks>({
    answer: false,
    cards: false,
    rules: false,
    sources: false,
  });

  const handleTelemetryClose = useCallback(() => {
    const activeId = requestDebugState.activeRequestId;
    let snapshot = activeId != null ? requestDebugState.snapshotsById.get(activeId) ?? null : null;
    if (!snapshot && requestDebugState.recentRequestIds.length > 0) {
      const lastId = requestDebugState.recentRequestIds[requestDebugState.recentRequestIds.length - 1];
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

  const { state: nameShapingState, actions: nameShapingActions } = useNameShapingState();
  const [nameShapingResolverIndex, setNameShapingResolverIndex] =
    useState<ResolverIndex | null>(null);
  const [nameShapingResolverIndexLoading, setNameShapingResolverIndexLoading] = useState(false);
  const nameShapingResolverIndexLoadingRef = useRef(false);
  useNameShapingController(
    nameShapingState,
    nameShapingActions,
    nameShapingResolverIndex,
  );
  const { capture: nameShapingCapture } = useSpineNameShapingCapture(
    nameShapingState.enabled,
    nameShapingActions,
    {
      emitOnTouchStart: true,
      debugLogging: NAME_SHAPING_VERBOSE_DEBUG_LOGS,
    },
  );
  useEffect(() => {
    let cancelled = false;

    // TODO(nameshaping-resume): Name Shaping is intentionally paused after the
    // current prototype foundation. Preserve lazy resolver bootstrap, but revisit
    // Android resolver perf before expanding this integration further.
    const loadNameShapingResolverIndex = async () => {
      if (!nameShapingState.enabled) return;
      if (nameShapingResolverIndex != null) return;
      if (nameShapingResolverIndexLoadingRef.current) return;

      nameShapingResolverIndexLoadingRef.current = true;
      if (!cancelled) {
        setNameShapingResolverIndexLoading(true);
      }

      const existingPackState = getPackState();
      const existingFileReader = getFileReader();
      let nameLookupPath =
        existingPackState?.validate.cardsNameLookupPath ?? 'cards/name_lookup.jsonl';
      let fileReader = existingFileReader;

      if (!fileReader) {
        let packRoot = '';
        try {
          packRoot = await copyBundlePackToDocuments();
        } catch (error) {
          logInfo('AgentSurface', 'NameShaping resolver pack copy skipped, falling back', {
            error: error instanceof Error ? error.message : String(error),
          });
          packRoot = (await getContentPackPathInDocuments()) ?? '';
        }
        fileReader =
          (packRoot ? createDocumentsPackReader(packRoot) : null) ??
          createBundlePackReader();
      }

      if (!fileReader) {
        if (!cancelled) {
          logInfo('AgentSurface', 'NameShaping resolver index unavailable: no pack reader');
        }
        nameShapingResolverIndexLoadingRef.current = false;
        if (!cancelled) {
          setNameShapingResolverIndexLoading(false);
        }
        return;
      }

      try {
        const resolverIndex = await buildResolverIndex(
          fileReader,
          nameLookupPath,
        );
        if (cancelled) return;
        setNameShapingResolverIndex(resolverIndex);
        const stats = resolverIndex.getIndexStats();
        logInfo('AgentSurface', 'NameShaping resolver index loaded', {
          entryCount: stats.entryCount,
          uniqueBaseSignatures: stats.uniqueBaseSignatures,
          nameLookupPath,
        });
      } catch (error) {
        if (cancelled) return;
        logInfo('AgentSurface', 'NameShaping resolver index failed to load', {
          nameLookupPath,
          error:
            error instanceof Error ? error.message : 'unknown resolver index load error',
        });
      } finally {
        nameShapingResolverIndexLoadingRef.current = false;
        if (!cancelled) {
          setNameShapingResolverIndexLoading(false);
        }
      }
    };

    loadNameShapingResolverIndex();

    return () => {
      cancelled = true;
    };
  }, [nameShapingState.enabled, nameShapingResolverIndex]);
  useEffect(() => {
    if (!NAME_SHAPING_VERBOSE_DEBUG_LOGS || !nameShapingState.enabled) return;
    logInfo('AgentSurface', 'NameShaping raw sequence updated', {
      count: nameShapingState.rawEmittedSequence.length,
      rawSequence: nameShapingState.rawEmittedSequence.map((token) => token.selector),
    });
  }, [nameShapingState.enabled, nameShapingState.rawEmittedSequence]);
  useEffect(() => {
    if (!nameShapingState.enabled) return;
    const count = nameShapingState.rawEmittedSequence.length;
    if (count === 0) return;
    const lastToken = nameShapingState.rawEmittedSequence[count - 1];
    logInfo('AgentSurface', 'NameShaping token appended', {
      count,
      selector: lastToken?.selector ?? null,
    });
  }, [nameShapingState.enabled, nameShapingState.rawEmittedSequence]);
  useEffect(() => {
    if (!NAME_SHAPING_VERBOSE_DEBUG_LOGS || !nameShapingState.enabled) return;
    logInfo('AgentSurface', 'NameShaping normalized signature updated', {
      count: nameShapingState.normalizedSignature.length,
      normalizedSignature: [...nameShapingState.normalizedSignature],
    });
  }, [nameShapingState.enabled, nameShapingState.normalizedSignature]);
  useEffect(() => {
    if (!NAME_SHAPING_VERBOSE_DEBUG_LOGS || !nameShapingState.enabled) return;
    logInfo('AgentSurface', 'NameShaping resolver candidates updated', {
      hasResolverIndex: nameShapingResolverIndex !== null,
      count: nameShapingState.resolverCandidates.length,
      candidates: nameShapingState.resolverCandidates.map((candidate) => ({
        cardId: candidate.cardId,
        displayName: candidate.displayName,
        score: candidate.score,
      })),
    });
  }, [
    nameShapingState.enabled,
    nameShapingState.resolverCandidates,
    nameShapingResolverIndex,
  ]);
  useEffect(() => {
    if (!nameShapingState.enabled) return;
    if (nameShapingState.committedSignature.length === 0) return;
    const trace = getActiveNameShapingCommitTrace(nameShapingState.committedSignature);
    if (!trace) return;
    logInfo('AgentSurface', 'NameShaping commit trace render settled', {
      traceId: trace.id,
      elapsedMs: trace.elapsedMs,
      committedLength: nameShapingState.committedSignature.length,
      candidateCount: nameShapingState.resolverCandidates.length,
      hasSelectedCandidate: nameShapingState.selectedCandidate != null,
    });
    endNameShapingCommitTrace(trace.id);
  }, [
    nameShapingState.enabled,
    nameShapingState.committedSignature,
    nameShapingState.resolverCandidates,
    nameShapingState.selectedCandidate,
  ]);
  useEffect(() => {
    if (
      !NAME_SHAPING_VERBOSE_DEBUG_LOGS ||
      !nameShapingState.enabled ||
      nameShapingState.normalizedSignature.length === 0 ||
      nameShapingResolverIndex !== null
    ) {
      return;
    }
    logInfo('AgentSurface', 'NameShaping normalized signature has no resolver index yet', {
      normalizedSignature: [...nameShapingState.normalizedSignature],
    });
  }, [
    nameShapingState.enabled,
    nameShapingState.normalizedSignature,
    nameShapingResolverIndex,
  ]);
  useEffect(() => {
    const viz = visualizationRef.current;
    if (!viz) return;
    const showNameShapingDebugZones =
      nameShapingState.enabled && NAME_SHAPING_VISUAL_DEBUG_ENABLED;
    // TODO(nameshaping-resume): These visual debug zones remain prototype-only.
    // Keep them aligned with the subsystem while paused, but do not treat them
    // as settled product UI.
    viz.showNameShapingTouchZones = showNameShapingDebugZones;
    viz.showTouchZones = showNameShapingDebugZones;
    logInfo(
      'AgentSurface',
      showNameShapingDebugZones
        ? 'NameShaping touch guide enabled'
        : 'NameShaping touch guide disabled',
    );
  }, [nameShapingState.enabled]);

  useEffect(() => {
    logInfo('AgentSurface', 'mounted as active composition root');
    if (typeof globalThis !== 'undefined') {
      (globalThis as { __LOG_SCOPES__?: string[] }).__LOG_SCOPES__ = DEBUG_LOG_SCOPES;
      (globalThis as { __DISABLE_IOS_EARCON_START__?: boolean }).__DISABLE_IOS_EARCON_START__ = true;
    }
    prepareEarcons().catch(() => {});
  }, []);

  const scrollYRef = useRef(0);
  const panelRectsContentRef = useRef<VisualizationPanelRects>({});
  const lastTapAtRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userModeLongPressActiveRef = useRef(false);
  const askHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerHoldActiveRef = useRef(false);
  const holdCompletionInFlightRef = useRef(false);
  const holdStartPromiseRef = useRef<
    Promise<{ ok: boolean; reason?: string }> | null
  >(null);
  const submitTriggeredForReleaseRef = useRef(false);
  const releaseReasonRef = useRef<'hold release' | 'timeout'>('hold release');
  const submitRef = useRef<(() => Promise<string | null>) | null>(null);

  const panelRectsLoggedRef = useRef(false);
  const flushPanelRects = useCallback(() => {
    const next: VisualizationPanelRects = {};
    const source = panelRectsContentRef.current;
    const keys: Array<keyof VisualizationPanelRects> = ['answer', 'cards', 'rules'];
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
    (key: keyof VisualizationPanelRects, rect: { x: number; y: number; w: number; h: number }) => {
      panelRectsContentRef.current = { ...panelRectsContentRef.current, [key]: rect };
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
      logInfo('AgentSurface', 'submit skipped: processing disabled for speech debug');
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

  const playListeningEndFeedback = useCallback((reason: 'hold release' | 'timeout') => {
    playListeningEndEarcon();
    triggerListeningEndHaptic();
    logInfo('Interaction', 'listening stopped');
    logInfo(
      'Interaction',
      reason === 'timeout'
        ? 'submit triggered from recording timeout'
        : 'submit triggered from hold release',
    );
  }, []);

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
  const canRevealPanels = DEBUG_SCENARIO || hasResultContext || hasReferenceStubs;
  const isAsking = orchState.lifecycle === 'processing';
  const interactionBandEnabled =
    !debugEnabled &&
    !anyPanelVisible &&
    orchState.lifecycle !== 'processing';
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

  const prevInteractionOwnerRef = useRef<ActiveInteractionOwner>(activeInteractionOwner);
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
    async (reason: 'hold release' | 'timeout') => {
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
        if (orchState.audioSessionState === 'listening') {
          await orchActions.stopListeningAndRequestSubmit();
        } else {
          logInfo('Interaction', 'stopListeningAndRequestSubmit skipped (not listening)', {
            audioSessionState: orchState.audioSessionState ?? null,
          });
        }
        // Listening stopped / submit triggered logs and feedback run after settlement in onTranscriptReadyForSubmit.
      } finally {
        holdStartPromiseRef.current = null;
        holdCompletionInFlightRef.current = false;
      }
    },
    [clearRecordingTimeout, orchActions, orchState.audioSessionState],
  );

  const handleCenterHoldStart = useCallback(() => {
    if (holdCompletionInFlightRef.current) return;
    if (!canHoldToSpeak) {
      logInfo('Interaction', 'hold blocked', {
        reason:
          isAsking ? 'active request' : anyPanelVisible ? 'overlay' : debugEnabled ? 'debug' : 'unknown',
      });
      return;
    }
    logInfo('Interaction', 'hold start detected', { tMs: Date.now() });
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
    lastTapAtRef.current = 0;
    submitTriggeredForReleaseRef.current = false;
    clearRecordingTimeout();
    logInfo('Interaction', 'center hold start detected');
    centerHoldActiveRef.current = true;
    (async () => {
      playListeningStartFeedback();
      const startPromise = orchActions.startListening(true);
      holdStartPromiseRef.current = startPromise;
      const result = await startPromise;
      if (holdStartPromiseRef.current === startPromise) {
        holdStartPromiseRef.current = null;
      }
      if (!result.ok) {
        centerHoldActiveRef.current = false;
        if (
          result.reason === 'audioNotReady' ||
          result.reason === 'audioStarting' ||
          result.reason === 'audioStopping' ||
          result.reason === 'audioSettling' ||
          result.reason === 'nativeGuard' ||
          result.reason === 'iosStopPending' ||
          result.reason === 'nativeReentrancy'
        ) {
          emitEvent(TRANSIENT_SIGNAL_SOFT_FAIL);
        }
        return;
      }
      if (!centerHoldActiveRef.current || holdCompletionInFlightRef.current) return;
      emitEvent('chunkAccepted');
      recordingTimeoutRef.current = setTimeout(() => {
        recordingTimeoutRef.current = null;
        if (!centerHoldActiveRef.current || holdCompletionInFlightRef.current) return;
        logInfo('Interaction', 'recording timeout reached');
        stopListeningAndSubmit('timeout').catch(() => {});
      }, MAX_RECORDING_DURATION_MS);
    })().catch(() => {
      centerHoldActiveRef.current = false;
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
    emitEvent,
  ]);

  const handleCenterHoldEnd = useCallback(() => {
    if (!centerHoldActiveRef.current || holdCompletionInFlightRef.current) return;
    if (orchState.audioSessionState !== 'listening') {
      return;
    }
    logInfo('Interaction', 'center hold end detected');
    clearRecordingTimeout();
    if (releaseGraceTimerRef.current) {
      clearTimeout(releaseGraceTimerRef.current);
      releaseGraceTimerRef.current = null;
    }
    stopListeningAndSubmit('hold release').catch(() => {});
  }, [clearRecordingTimeout, orchState.audioSessionState, stopListeningAndSubmit]);

  const handleUserModeTap = useCallback(() => {
    if (orchState.lifecycle === 'processing' || orchState.lifecycle === 'listening') {
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
        reason:
          isAsking ? 'active request' : anyPanelVisible ? 'overlay' : debugEnabled ? 'debug' : 'unknown',
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
        if (
          result.reason === 'audioNotReady' ||
          result.reason === 'audioStarting' ||
          result.reason === 'audioStopping' ||
          result.reason === 'audioSettling' ||
          result.reason === 'nativeGuard' ||
          result.reason === 'iosStopPending' ||
          result.reason === 'nativeReentrancy'
        ) {
          emitEvent(TRANSIENT_SIGNAL_SOFT_FAIL);
        }
        return;
      }
      if (!userModeLongPressActiveRef.current || holdCompletionInFlightRef.current) return;
      emitEvent('chunkAccepted');
      recordingTimeoutRef.current = setTimeout(() => {
        recordingTimeoutRef.current = null;
        if (!userModeLongPressActiveRef.current || holdCompletionInFlightRef.current) return;
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
    emitEvent,
  ]);

  const handleUserModeLongPressEnd = useCallback(() => {
    if (!userModeLongPressActiveRef.current || holdCompletionInFlightRef.current) return;
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

  // Refs for diagnostic log only so handleClusterTap identity stays stable (avoids invariant on Android when deps churn).
  const clusterTapDiagnosticRef = useRef({
    canRevealPanels: false,
    interactionBandEnabled: false,
    canSwipeContext: false,
    lifecycle: '' as string,
    hasResultContext: false,
    hasReferenceStubs: false,
    hasResponseText: false,
    hasValidationSummary: false,
  });
  clusterTapDiagnosticRef.current = {
    canRevealPanels,
    interactionBandEnabled,
    canSwipeContext,
    lifecycle: orchState.lifecycle,
    hasResultContext,
    hasReferenceStubs,
    hasResponseText: orchState.responseText != null,
    hasValidationSummary: orchState.validationSummary != null,
  };

  const handleClusterTap = useCallback(
    (cluster: 'rules' | 'cards', diagnosticTouchEndId?: number) => {
      if (!canSwipeContext) {
        // TODO(android): augmented log for touch-end diagnosis; remove when no longer needed
        const d = clusterTapDiagnosticRef.current;
        logInfo('Interaction', 'swipe blocked due to no valid context', {
          timestamp: Date.now(),
          touchEndSequenceId: diagnosticTouchEndId,
          canRevealPanels: d.canRevealPanels,
          interactionBandEnabled: d.interactionBandEnabled,
          canSwipeContext: d.canSwipeContext,
          lifecycle: d.lifecycle,
          hasResultContext: d.hasResultContext,
          hasReferenceStubs: d.hasReferenceStubs,
          hasResponseText: d.hasResponseText,
          hasValidationSummary: d.hasValidationSummary,
        });
        return;
      }
      if (cluster === 'rules') {
        setRevealedBlocks({ answer: false, cards: false, rules: true, sources: false });
        emitEvent('tapCitation');
      } else {
        setRevealedBlocks({ answer: false, cards: true, rules: false, sources: false });
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
          ? requestDebugState.recentRequestIds[requestDebugState.recentRequestIds.length - 1]
          : null);
      logInfo('ResponseSurface', 'response_surface_revealed_by_user', {
        requestId: requestId ?? undefined,
        lifecycle: orchState.lifecycle,
        reason: 'userReveal',
      });
    },
    [orchState.lifecycle, requestDebugState.activeRequestId, requestDebugState.recentRequestIds],
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
    setRevealedBlocks({ answer: false, cards: false, rules: false, sources: false });
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
      setRevealedBlocks({ answer: false, cards: false, rules: false, sources: false });
    }
  }, [
    canRevealPanels,
  ]);

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
      setRevealedBlocks({ answer: false, cards: false, rules: false, sources: false });
    }
    if (prev !== 'processing' && next === 'processing') {
      setRevealedBlocks({ answer: false, cards: false, rules: false, sources: false });
    }
  }, [orchState.lifecycle]);

  useEffect(() => {
    if (cardsCount === 0 || !revealedBlocks.cards) clearPanelRect('cards');
    if (rulesCount === 0 || !revealedBlocks.rules) clearPanelRect('rules');
    if (!canRevealPanels || !revealedBlocks.answer) clearPanelRect('answer');
  }, [cardsCount, rulesCount, canRevealPanels, revealedBlocks.answer, revealedBlocks.cards, revealedBlocks.rules, clearPanelRect]);

  useEffect(() => {
    const setReduceMotion = (enabled: boolean) => {
      if (visualizationRef.current) visualizationRef.current.reduceMotion = enabled;
    };
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    copyBundlePackToDocuments().catch(() => {});
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
    return <SemanticChannelLoadingView theme={theme} paddingTop={insets.top} />;
  }

  const holdToSpeakSlot =
    SHOW_HOLD_TO_SPEAK ? (
      <Pressable
        style={[localStyles.askTrigger, { borderColor, backgroundColor: inputBg }]}
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
      <VisualizationSurface
        visualizationRef={visualizationRef}
        controlsEnabled={debugEnabled}
        inputEnabled
        clusterZoneHighlights={!debugEnabled && !anyPanelVisible}
        canvasBackground={theme.viz.canvasBackground}
        onShortTap={!debugEnabled ? handleUserModeTap : undefined}
        onLongPressStart={!debugEnabled ? handleUserModeLongPressStart : undefined}
        onLongPressEnd={!debugEnabled ? handleUserModeLongPressEnd : undefined}
        onClusterRelease={!debugEnabled ? handleClusterTap : undefined}
        >
          <SemanticChannelView
          contentPaddingTop={insets.top}
          contentPaddingBottom={insets.bottom}
          onScroll={handleOverlayScroll}
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
      <NameShapingTouchGuideOverlay
        visible={nameShapingState.enabled && NAME_SHAPING_VISUAL_DEBUG_ENABLED}
        bandTopInsetPx={
          nameShapingState.enabled
            ? 0
            : (visualizationRef.current?.scene?.zones.layout.bandTopInsetPx ?? 112)
        }
      />
      <Modal
        visible={
          nameShapingState.enabled &&
          nameShapingResolverIndex === null &&
          nameShapingResolverIndexLoading
        }
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View pointerEvents="none" style={localStyles.nameShapingLoadingOverlay}>
          <View
            style={[
              localStyles.nameShapingLoadingCard,
              { backgroundColor: inputBg, borderColor },
            ]}
          >
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[localStyles.nameShapingLoadingTitle, { color: textColor }]}>
              Prototype Loading
            </Text>
            <Text style={[localStyles.nameShapingLoadingHint, { color: mutedColor }]}>
              Loading NameShaping card-name index...
            </Text>
          </View>
        </View>
      </Modal>
      <InteractionBand
        visualizationRef={visualizationRef}
        onClusterRelease={handleClusterTap}
        onCenterHoldStart={!debugEnabled ? handleCenterHoldStart : undefined}
        onCenterHoldEnd={!debugEnabled ? handleCenterHoldEnd : undefined}
        nameShapingCapture={
          nameShapingState.enabled && !debugEnabled ? nameShapingCapture : undefined
        }
        topInsetOverridePx={nameShapingState.enabled ? 0 : undefined}
        enabled={interactionBandEnabled}
        blocked={orchState.ioBlockedUntil != null}
        blockedUntil={orchState.ioBlockedUntil ?? null}
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
          onLayout={(e) => {
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
                    ? telemetryLayout.height - ((insets.top || 0) + (insets.bottom || 0) + 16)
                    : Dimensions.get('window').height - ((insets.top || 0) + (insets.bottom || 0) + 16)
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
                onToggleStubCards={() => setDebugStubCardsEnabled(prev => !prev)}
                onToggleStubRules={() => setDebugStubRulesEnabled(prev => !prev)}
                nameShapingState={nameShapingState}
                nameShapingActions={nameShapingActions}
                maxHeight={
                  telemetryLayout.height > 0
                    ? telemetryLayout.height - ((insets.top || 0) + (insets.bottom || 0) + 16)
                    : Dimensions.get('window').height - ((insets.top || 0) + (insets.bottom || 0) + 16)
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
          {debugPanelMode === 'off' ? 'Dev' : debugPanelMode === 'telemetry' ? 'Telemetry' : 'Viz'}
        </Text>
      </Pressable>
    </View>
  );
}

const localStyles = StyleSheet.create({
  screenWrapper: { flex: 1 },
  nameShapingLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  nameShapingLoadingCard: {
    minWidth: 220,
    maxWidth: 320,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  nameShapingLoadingTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  nameShapingLoadingHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  askTrigger: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  askTriggerLabel: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  askTriggerHint: { fontSize: 12, lineHeight: 16, marginTop: 4, fontWeight: '500' },
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
