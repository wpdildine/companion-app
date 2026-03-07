/**
 * AgentSurface: top-level composition root for the agent experience.
 * Composes VisualizationSurface, ResultsOverlay, InteractionBand, DevScreen.
 * Feeds normalized agent state into VisualizationController and ResultsOverlay.
 * Does not own provider/runtime logic; that lives in AgentOrchestrator.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CardRef, SelectedRule } from '../components';
import { DevScreen, UserVoiceView, VoiceLoadingView } from '../screens';
import { getTheme } from '../theme';
import {
  createDefaultVisualizationRef,
  DebugZoneOverlay,
  getSceneDescription,
  VisualizationSurface,
  InteractionBand,
} from '../visualization';
import type {
  VisualizationPanelRects,
  AiUiSignalsEvent,
} from '../visualization';
import { useVisualizationSignals } from './hooks/useVisualizationSignals';
import {
  useAgentOrchestrator,
  useVisualizationController,
  ResultsOverlay,
  type ResultsOverlayRevealedBlocks,
} from './agent';
import { copyBundlePackToDocuments } from '../rag';

const DEBUG_ENABLED_DEFAULT = false;
const DEBUG_SCENARIO = false;
const SHOW_REVEAL_CHIPS = false;
const SHOW_HOLD_TO_SPEAK = false;
const DOUBLE_TAP_MS = 280;
const ASK_HOLD_MS = 400;

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
      r.scene = getSceneDescription();
      return r;
    })(),
  );
  const listenersRef = useRef<import('./agent').AgentOrchestratorListeners | null>(null);
  const orch = useAgentOrchestrator({ listenersRef });
  const { state: orchState, actions: orchActions } = orch;

  const [debugEnabled, setDebugEnabled] = useState(DEBUG_ENABLED_DEFAULT);
  const [debugShowZones, setDebugShowZones] = useState(false);
  const [panelRectsForDebug, setPanelRectsForDebug] = useState<VisualizationPanelRects>({});
  const [revealedBlocks, setRevealedBlocks] = useState<ResultsOverlayRevealedBlocks>({
    answer: false,
    cards: false,
    rules: false,
    sources: false,
  });

  const { setSignals, emitEvent } = useVisualizationSignals(visualizationRef);
  useVisualizationController(visualizationRef, orchState, listenersRef, {
    debugEnabled,
    debugScenario: DEBUG_SCENARIO,
  });

  const scrollYRef = useRef(0);
  const panelRectsContentRef = useRef<VisualizationPanelRects>({});
  const lastTapAtRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userModeLongPressActiveRef = useRef(false);
  const askHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [setSignals]);

  const updatePanelRect = useCallback(
    (key: keyof VisualizationPanelRects, rect: { x: number; y: number; w: number; h: number }) => {
      panelRectsContentRef.current = { ...panelRectsContentRef.current, [key]: rect };
      flushPanelRects();
      if (debugShowZones) {
        setPanelRectsForDebug(prev => ({
          ...prev,
          [key]: { ...rect, y: rect.y - scrollYRef.current },
        }));
      }
    },
    [flushPanelRects, debugShowZones],
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
        event: null as AiUiSignalsEvent,
      };
      if (debugEnabled) {
        const { phase: _p, ...rest } = dummySignals;
        setSignals(rest);
      } else {
        setSignals(dummySignals);
      }
      return null;
    }
    return orchActions.submit();
  }, [orchActions, setSignals, debugEnabled]);

  const handleUserModeTap = useCallback(() => {
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
  }, [orchState.responseText, orchActions]);

  const handleUserModeLongPressStart = useCallback(() => {
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
    lastTapAtRef.current = 0;
    userModeLongPressActiveRef.current = true;
    orchActions.startListening(true);
  }, [orchActions]);

  const handleUserModeLongPressEnd = useCallback(() => {
    if (!userModeLongPressActiveRef.current) return;
    userModeLongPressActiveRef.current = false;
    (async () => {
      await orchActions.stopListening();
      setTimeout(() => {
        handleSubmit();
      }, 250);
    })();
  }, [orchActions, handleSubmit]);

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
      if (cluster === 'rules') {
        setRevealedBlocks({ answer: false, cards: false, rules: true, sources: false });
        emitEvent('tapCitation');
      } else {
        setRevealedBlocks({ answer: false, cards: true, rules: false, sources: false });
        emitEvent('tapCard');
      }
    },
    [emitEvent],
  );

  const revealBlock = useCallback((key: keyof ResultsOverlayRevealedBlocks) => {
    setRevealedBlocks(prev => ({ ...prev, [key]: true }));
  }, []);

  const showContentPanels =
    orchState.lifecycle !== 'idle' ||
    orchState.responseText != null ||
    orchState.validationSummary != null ||
    orchState.error != null;
  const cardsCount = DEBUG_SCENARIO
    ? dummyCards.length
    : (orchState.validationSummary?.cards?.length ?? 0);
  const rulesCount = DEBUG_SCENARIO
    ? dummyRules.length
    : (orchState.validationSummary?.rules?.length ?? 0);
  const anyPanelVisible =
    revealedBlocks.answer ||
    revealedBlocks.cards ||
    revealedBlocks.rules ||
    revealedBlocks.sources;
  // Allow cluster-release interactions to open panel stubs even when no answer payload exists yet.
  const canRevealPanels = DEBUG_SCENARIO || showContentPanels || anyPanelVisible;
  const isAsking = orchState.lifecycle === 'thinking' || orchState.lifecycle === 'retrieving';

  useEffect(() => {
    if (!canRevealPanels) {
      setRevealedBlocks({ answer: false, cards: false, rules: false, sources: false });
    }
  }, [
    canRevealPanels,
  ]);

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
    };
  }, []);

  if (!orchState.voiceReady && !orchState.error) {
    return <VoiceLoadingView theme={theme} paddingTop={insets.top} />;
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
        <UserVoiceView
          contentPaddingTop={insets.top}
          contentPaddingBottom={insets.bottom}
          onScroll={handleOverlayScroll}
        >
          <ResultsOverlay
            responseText={orchState.responseText}
            validationSummary={orchState.validationSummary}
            error={orchState.error}
            isAsking={isAsking}
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
            showRevealChips={SHOW_REVEAL_CHIPS}
            holdToSpeakSlot={holdToSpeakSlot}
          />
        </UserVoiceView>
      </VisualizationSurface>
      <InteractionBand
        visualizationRef={visualizationRef}
        onClusterRelease={handleClusterTap}
        enabled={!debugEnabled && !anyPanelVisible && orchState.lifecycle !== 'thinking' && orchState.lifecycle !== 'retrieving'}
      />
      <DebugZoneOverlay panelRects={panelRectsForDebug} visible={debugShowZones} />
      {debugEnabled && (
        <DevScreen
          visualizationRef={visualizationRef}
          onClose={() => setDebugEnabled(false)}
          theme={{ text: textColor, textMuted: mutedColor, background: inputBg }}
        />
      )}
      <Pressable
        style={[localStyles.devToggle, { bottom: (insets.bottom || 16) + 92 }]}
        hitSlop={10}
        onPress={() => setDebugEnabled(prev => !prev)}
      >
        <Text style={localStyles.devToggleLabel}>
          {debugEnabled ? 'User' : 'Dev'}
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
  askTriggerHint: { fontSize: 12, lineHeight: 16, marginTop: 4, fontWeight: '500' },
  devToggle: {
    position: 'absolute',
    right: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 5,
    elevation: 5,
  },
  devToggleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
