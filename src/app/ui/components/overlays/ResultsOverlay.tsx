/**
 * ResultsOverlay: conventional grounded answer presentation layer.
 * Owns answer panel, cards, rules, sources, reveal state, panel rect reporting.
 * Does not know provider orchestration or visualization mode selection.
 */

import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ValidationSummary } from '../../../../rag';
import { logInfo } from '../../../../shared/logging';
import type {
  VisualizationIntensity,
  VisualizationPanelRects,
  VisualizationSignalEvent,
} from '../../../../visualization';
import type { ProcessingSubstate } from '../../../agent/types';
import type { CardRef } from '../content/CardReferenceSection';
import { CardReferenceSection } from '../content/CardReferenceSection';
import type { SelectedRule } from '../content/SelectedRulesSection';
import { SelectedRulesSection } from '../content/SelectedRulesSection';
import { RevealChip } from '../controls';
import { ContentPanel } from '../panels';

export interface ResultsOverlayRevealedBlocks {
  answer: boolean;
  cards: boolean;
  rules: boolean;
  sources: boolean;
}

export interface ResultsOverlayTheme {
  text: string;
  textMuted: string;
  background: string;
  border: string;
  primary: string;
  warning: string;
}

export interface ResultsOverlayProps {
  /** Response and validation from orchestrator (overlay reads only; no phase inference) */
  responseText: string | null;
  validationSummary: ValidationSummary | null;
  /** lifecycle === 'processing' */
  isAsking: boolean;
  /** Meaningful when isAsking; overlay may branch on this for loading vs content. */
  processingSubstate: ProcessingSubstate | null;
  error: string | null;
  onClearError?: () => void;
  /** Reveal state and handlers (owned by composition; overlay is purely presentational) */
  revealedBlocks: ResultsOverlayRevealedBlocks;
  revealBlock: (key: keyof ResultsOverlayRevealedBlocks) => void;
  setRevealedBlocks: React.Dispatch<
    React.SetStateAction<ResultsOverlayRevealedBlocks>
  >;
  /** Panel rect reporting for visualization interaction zones */
  updatePanelRect: (
    key: keyof VisualizationPanelRects,
    rect: { x: number; y: number; w: number; h: number },
  ) => void;
  clearPanelRect: (key: keyof VisualizationPanelRects) => void;
  /** Theme and viz primitives (from theme + runtime ref) */
  theme: ResultsOverlayTheme;
  intensity: VisualizationIntensity;
  reduceMotion: boolean;
  /** Semantic events for visualization (tapCard, tapCitation) */
  emitEvent: (event: VisualizationSignalEvent) => void;
  /** When true, show content stack and use dummy data when provided */
  showContentPanels: boolean;
  canRevealPanels: boolean;
  /** Debug scenario: show dummy answer/cards/rules */
  debugScenario?: boolean;
  dummyAnswer?: string;
  dummyCards?: CardRef[];
  dummyRules?: SelectedRule[];
  stubCards?: CardRef[];
  stubRules?: SelectedRule[];
  /** Show reveal chips row (e.g. Reveal Answer, Reveal Cards) */
  showRevealChips?: boolean;
  /** Optional hold-to-speak row (rendered above content stack) */
  holdToSpeakSlot?: React.ReactNode;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  scrollOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentStack: {
    gap: 16,
    marginBottom: 8,
  },
  revealDock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  askTriggerRow: {
    marginBottom: 16,
  },
  responseText: {
    fontSize: 15,
    lineHeight: 22,
  },
  responsePlaceholder: {
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  responseLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  responseLabelInline: {
    marginBottom: 0,
  },
  validationHint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    marginBottom: 6,
  },
});

const PRE_STREAMING_SUBSTATES: Array<ProcessingSubstate | null> = [
  'retrieving',
  'preparingContext',
  'loadingModel',
  'awaitingFirstToken',
];

function mergeCardReferences(cards: CardRef[]): CardRef[] {
  const merged = new Map<string, CardRef>();
  for (const card of cards) {
    const key = (card.name || card.id).trim().toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, card);
      continue;
    }
    merged.set(key, {
      ...existing,
      id: existing.id || card.id,
      imageUri: existing.imageUri ?? card.imageUri,
      imageUrl: existing.imageUrl ?? card.imageUrl,
      typeLine: existing.typeLine ?? card.typeLine,
      manaCost: existing.manaCost ?? card.manaCost,
      oracle: existing.oracle ?? card.oracle,
    });
  }
  return Array.from(merged.values());
}

export function ResultsOverlay({
  responseText,
  validationSummary,
  error,
  onClearError,
  isAsking,
  processingSubstate,
  revealedBlocks,
  revealBlock,
  setRevealedBlocks,
  updatePanelRect,
  clearPanelRect: _clearPanelRect,
  theme,
  intensity,
  reduceMotion,
  emitEvent,
  showContentPanels,
  canRevealPanels,
  debugScenario = false,
  dummyAnswer = '',
  dummyCards = [],
  dummyRules = [],
  stubCards = [],
  stubRules = [],
  showRevealChips = false,
  holdToSpeakSlot,
}: ResultsOverlayProps) {
  const showLoadingPlaceholder =
    isAsking &&
    PRE_STREAMING_SUBSTATES.includes(processingSubstate) &&
    responseText == null;
  const {
    text: textColor,
    textMuted: mutedColor,
    background: panelFill,
    border: borderColor,
    primary: accentIntrusionA,
    warning: warn,
  } = theme;

  const cards = debugScenario
    ? dummyCards
    : mergeCardReferences(
        validationSummary?.cards?.map(c => ({
          id: c.doc_id ?? c.raw,
          name: c.canonical ?? c.raw,
          imageUri: undefined,
          oracle: c.oracleText,
        })) ?? stubCards,
      );
  const rules = debugScenario
    ? dummyRules
    : validationSummary?.rules?.map(r => ({
        id: r.canonical ?? r.raw,
        title: r.title ?? r.canonical ?? r.raw,
        excerpt: r.excerpt ?? r.raw,
        used: r.status === 'valid',
      })) ?? stubRules;
  const cardsCount = cards.length;
  const rulesCount = rules.length;
  const sourcesCount = debugScenario
    ? dummyRules.length + dummyCards.length
    : rules.length + cards.length;

  const mountedLoggedRef = useRef(false);
  const payloadLoggedRef = useRef(false);
  const prevRevealedRef = useRef({
    answer: false,
    cards: false,
    rules: false,
    sources: false,
  });
  useEffect(() => {
    if (!mountedLoggedRef.current && (canRevealPanels || showContentPanels)) {
      mountedLoggedRef.current = true;
      logInfo('ResultsOverlay', 'mounted');
    }
  }, [canRevealPanels, showContentPanels]);
  const hasPayload =
    responseText != null ||
    (validationSummary != null &&
      (validationSummary.cards?.length > 0 ||
        validationSummary.rules?.length > 0));
  useEffect(() => {
    if (hasPayload && !payloadLoggedRef.current) {
      payloadLoggedRef.current = true;
      logInfo('ResultsOverlay', 'received answer/cards/rules payload');
    }
  }, [hasPayload]);
  useEffect(() => {
    const prev = prevRevealedRef.current;
    const keys: Array<keyof typeof revealedBlocks> = [
      'answer',
      'cards',
      'rules',
      'sources',
    ];
    for (const key of keys) {
      const next = revealedBlocks[key];
      if (prev[key] !== next) {
        if (next) {
          logInfo(
            'ResultsOverlay',
            key === 'answer'
              ? 'answer panel shown'
              : key === 'cards'
              ? 'cards panel shown'
              : key === 'rules'
              ? 'rules panel shown'
              : 'sources panel shown',
          );
        } else {
          logInfo('ResultsOverlay', 'panel dismissed');
        }
      }
    }
    prevRevealedRef.current = { ...revealedBlocks };
  }, [revealedBlocks]);

  if (!canRevealPanels && !showContentPanels) {
    return null;
  }

  const answerPanelVariant =
    validationSummary &&
    (validationSummary.stats.unknownCardCount > 0 ||
      validationSummary.stats.invalidRuleCount > 0)
      ? 'warning'
      : 'answer';

  return (
    <View style={[styles.container, styles.scrollOverlay]}>
      {holdToSpeakSlot ? (
        <View style={styles.askTriggerRow}>{holdToSpeakSlot}</View>
      ) : null}
      {canRevealPanels || showContentPanels ? (
        <View style={styles.contentStack}>
          {showRevealChips && (
            <View style={styles.revealDock}>
              {!revealedBlocks.answer && (
                <RevealChip
                  label="Reveal Answer"
                  onPress={() => revealBlock('answer')}
                  surface="product"
                />
              )}
              {!revealedBlocks.cards && cardsCount > 0 && (
                <RevealChip
                  label="Reveal Cards"
                  onPress={() => revealBlock('cards')}
                  surface="product"
                />
              )}
              {!revealedBlocks.rules && rulesCount > 0 && (
                <RevealChip
                  label="Reveal Rules"
                  onPress={() => revealBlock('rules')}
                  surface="product"
                />
              )}
              {!revealedBlocks.sources && sourcesCount > 0 && (
                <RevealChip
                  label="Reveal Sources"
                  onPress={() => revealBlock('sources')}
                  surface="product"
                />
              )}
            </View>
          )}

          {debugScenario ? (
            <>
              {revealedBlocks.answer && (
                <ContentPanel
                  title="Answer"
                  subtitle="Grounded response"
                  variant="answer"
                  intensity={intensity}
                  reduceMotion={reduceMotion}
                  headerDecon={false}
                  ink={textColor}
                  mutedInk={mutedColor}
                  panelFill={panelFill}
                  panelStroke={borderColor}
                  accentIntrusionA={accentIntrusionA}
                  warn={warn}
                  onRect={rect => updatePanelRect('answer', rect)}
                  dismissible
                  onDismiss={() =>
                    setRevealedBlocks(prev => ({ ...prev, answer: false }))
                  }
                >
                  <Text
                    style={[styles.responseText, { color: textColor }]}
                    selectable
                  >
                    {dummyAnswer}
                  </Text>
                </ContentPanel>
              )}
              {dummyCards.length > 0 && revealedBlocks.cards && (
                <CardReferenceSection
                  cards={dummyCards}
                  intensity={intensity}
                  reduceMotion={reduceMotion}
                  onCardPress={() => {
                    revealBlock('cards');
                    emitEvent('tapCard');
                  }}
                  ink={textColor}
                  mutedInk={mutedColor}
                  panelFill={panelFill}
                  panelStroke={borderColor}
                  accentIntrusionA={accentIntrusionA}
                  warn={warn}
                  onRect={rect => updatePanelRect('cards', rect)}
                  dismissible
                  onDismiss={() =>
                    setRevealedBlocks(prev => ({ ...prev, cards: false }))
                  }
                />
              )}
              {dummyRules.length > 0 && revealedBlocks.rules && (
                <SelectedRulesSection
                  rules={dummyRules}
                  intensity={intensity}
                  reduceMotion={reduceMotion}
                  onRulePress={() => {
                    revealBlock('rules');
                    emitEvent('tapCitation');
                  }}
                  ink={textColor}
                  mutedInk={mutedColor}
                  panelFill={panelFill}
                  panelStroke={borderColor}
                  accentIntrusionA={accentIntrusionA}
                  warn={warn}
                  onRect={rect => updatePanelRect('rules', rect)}
                  dismissible
                  onDismiss={() =>
                    setRevealedBlocks(prev => ({ ...prev, rules: false }))
                  }
                />
              )}
              {revealedBlocks.sources && (
                <ContentPanel
                  title="Sources"
                  subtitle="Auditable context summary"
                  variant="neutral"
                  intensity={intensity}
                  reduceMotion={reduceMotion}
                  headerDecon
                  ink={textColor}
                  mutedInk={mutedColor}
                  panelFill={panelFill}
                  panelStroke={borderColor}
                  accentIntrusionA={accentIntrusionA}
                  warn={warn}
                  dismissible
                  onDismiss={() =>
                    setRevealedBlocks(prev => ({ ...prev, sources: false }))
                  }
                >
                  <Text style={[styles.responseText, { color: textColor }]}>
                    {dummyRules.length} rule snippet(s), {dummyCards.length}{' '}
                    card reference(s).
                  </Text>
                </ContentPanel>
              )}
            </>
          ) : (
            <>
              {error ? (
                <ContentPanel
                  title="Input Error"
                  subtitle="Please retry"
                  variant="warning"
                  intensity={intensity}
                  reduceMotion={reduceMotion}
                  headerDecon={false}
                  ink={textColor}
                  mutedInk={mutedColor}
                  panelFill={panelFill}
                  panelStroke={borderColor}
                  accentIntrusionA={accentIntrusionA}
                  warn={warn}
                  dismissible
                  onDismiss={onClearError}
                >
                  <Text style={styles.errorText}>{error}</Text>
                </ContentPanel>
              ) : null}

              {revealedBlocks.answer && (
                <ContentPanel
                  title="Answer"
                  subtitle="Grounded response"
                  variant={answerPanelVariant}
                  intensity={intensity}
                  reduceMotion={reduceMotion}
                  headerDecon={false}
                  ink={textColor}
                  mutedInk={mutedColor}
                  panelFill={panelFill}
                  panelStroke={borderColor}
                  accentIntrusionA={accentIntrusionA}
                  warn={warn}
                  onRect={rect => updatePanelRect('answer', rect)}
                  dismissible
                  onDismiss={() =>
                    setRevealedBlocks(prev => ({ ...prev, answer: false }))
                  }
                >
                  {showLoadingPlaceholder ? (
                    <View style={styles.responseLoadingRow}>
                      <ActivityIndicator size="small" color={textColor} />
                      <Text
                        style={[
                          styles.responseLabelInline,
                          { color: mutedColor },
                        ]}
                      >
                        Loading…
                      </Text>
                    </View>
                  ) : responseText != null ? (
                    <>
                      <Text
                        style={[styles.responseText, { color: textColor }]}
                        selectable
                      >
                        {responseText}
                      </Text>
                      {validationSummary &&
                      (validationSummary.stats.unknownCardCount > 0 ||
                        validationSummary.stats.invalidRuleCount > 0) ? (
                        <Text
                          style={[styles.validationHint, { color: mutedColor }]}
                        >
                          Corrected {validationSummary.stats.unknownCardCount}{' '}
                          name(s), {validationSummary.stats.invalidRuleCount}{' '}
                          rule(s) invalid.
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text
                      style={[
                        styles.responsePlaceholder,
                        { color: mutedColor },
                      ]}
                    >
                      Submit a question to see the answer here.
                    </Text>
                  )}
                </ContentPanel>
              )}

              {revealedBlocks.cards &&
                (() => {
                  if (cards.length === 0) {
                    return (
                      <ContentPanel
                        title="Cards Referenced"
                        subtitle="No card references yet"
                        variant="cards"
                        intensity={intensity}
                        reduceMotion={reduceMotion}
                        headerDecon
                        ink={textColor}
                        mutedInk={mutedColor}
                        panelFill={panelFill}
                        panelStroke={borderColor}
                        accentIntrusionA={accentIntrusionA}
                        warn={warn}
                        onRect={rect => updatePanelRect('cards', rect)}
                        dismissible
                        onDismiss={() =>
                          setRevealedBlocks(prev => ({ ...prev, cards: false }))
                        }
                      >
                        <Text
                          style={[
                            styles.responsePlaceholder,
                            { color: mutedColor },
                          ]}
                        >
                          No cards were selected for this response yet.
                        </Text>
                      </ContentPanel>
                    );
                  }
                  return (
                    <CardReferenceSection
                      cards={cards}
                      intensity={intensity}
                      reduceMotion={reduceMotion}
                      onCardPress={() => {
                        revealBlock('cards');
                        emitEvent('tapCard');
                      }}
                      ink={textColor}
                      mutedInk={mutedColor}
                      panelFill={panelFill}
                      panelStroke={borderColor}
                      accentIntrusionA={accentIntrusionA}
                      warn={warn}
                      onRect={rect => updatePanelRect('cards', rect)}
                      dismissible
                      onDismiss={() =>
                        setRevealedBlocks(prev => ({ ...prev, cards: false }))
                      }
                    />
                  );
                })()}
              {revealedBlocks.rules &&
                (() => {
                  if (rules.length === 0) {
                    return (
                      <ContentPanel
                        title="Selected Rules"
                        subtitle="No rule references yet"
                        variant="rules"
                        intensity={intensity}
                        reduceMotion={reduceMotion}
                        headerDecon
                        ink={textColor}
                        mutedInk={mutedColor}
                        panelFill={panelFill}
                        panelStroke={borderColor}
                        accentIntrusionA={accentIntrusionA}
                        warn={warn}
                        onRect={rect => updatePanelRect('rules', rect)}
                        dismissible
                        onDismiss={() =>
                          setRevealedBlocks(prev => ({ ...prev, rules: false }))
                        }
                      >
                        <Text
                          style={[
                            styles.responsePlaceholder,
                            { color: mutedColor },
                          ]}
                        >
                          No rules were selected for this response yet.
                        </Text>
                      </ContentPanel>
                    );
                  }
                  return (
                    <SelectedRulesSection
                      rules={rules}
                      intensity={intensity}
                      reduceMotion={reduceMotion}
                      onRulePress={() => {
                        revealBlock('rules');
                        emitEvent('tapCitation');
                      }}
                      ink={textColor}
                      mutedInk={mutedColor}
                      panelFill={panelFill}
                      panelStroke={borderColor}
                      accentIntrusionA={accentIntrusionA}
                      warn={warn}
                      onRect={rect => updatePanelRect('rules', rect)}
                      dismissible
                      onDismiss={() =>
                        setRevealedBlocks(prev => ({ ...prev, rules: false }))
                      }
                    />
                  );
                })()}
              {validationSummary && revealedBlocks.sources ? (
                <ContentPanel
                  title="Sources"
                  subtitle="Auditable context summary"
                  variant="neutral"
                  intensity={intensity}
                  reduceMotion={reduceMotion}
                  headerDecon
                  ink={textColor}
                  mutedInk={mutedColor}
                  panelFill={panelFill}
                  panelStroke={borderColor}
                  accentIntrusionA={accentIntrusionA}
                  warn={warn}
                  dismissible
                  onDismiss={() =>
                    setRevealedBlocks(prev => ({ ...prev, sources: false }))
                  }
                >
                  <Text style={[styles.responseText, { color: textColor }]}>
                    {validationSummary.rules.length} rule snippet(s),{' '}
                    {validationSummary.cards.length} card reference(s).
                  </Text>
                </ContentPanel>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}
