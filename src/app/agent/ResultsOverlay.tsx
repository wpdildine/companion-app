/**
 * ResultsOverlay: conventional grounded answer presentation layer.
 * Owns answer panel, cards, rules, sources, reveal state, panel rect reporting.
 * Does not know provider orchestration or visualization mode selection.
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CardReferenceBlock,
  DeconPanel,
  SelectedRulesBlock,
  type CardRef,
  type SelectedRule,
} from '../../components';
import type { ValidationSummary } from '../../rag';
import type { VisualizationIntensity } from '../../visualization';
import type { AiUiSignalsEvent } from '../../visualization';
import type { VisualizationPanelRects } from '../../visualization';

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
  /** Response and validation from orchestrator */
  responseText: string | null;
  validationSummary: ValidationSummary | null;
  error: string | null;
  isAsking: boolean;
  /** Reveal state and handlers */
  revealedBlocks: ResultsOverlayRevealedBlocks;
  revealBlock: (key: keyof ResultsOverlayRevealedBlocks) => void;
  setRevealedBlocks: React.Dispatch<React.SetStateAction<ResultsOverlayRevealedBlocks>>;
  /** Panel rect reporting for visualization interaction zones */
  updatePanelRect: (
    key: keyof VisualizationPanelRects,
    rect: { x: number; y: number; w: number; h: number },
  ) => void;
  clearPanelRect: (key: keyof VisualizationPanelRects) => void;
  /** Theme and viz primitives (from theme + engine ref) */
  theme: ResultsOverlayTheme;
  intensity: VisualizationIntensity;
  reduceMotion: boolean;
  /** Semantic events for visualization (tapCard, tapCitation) */
  emitEvent: (event: AiUiSignalsEvent) => void;
  /** When true, show content stack and use dummy data when provided */
  showContentPanels: boolean;
  canRevealPanels: boolean;
  /** Debug scenario: show dummy answer/cards/rules */
  debugScenario?: boolean;
  dummyAnswer?: string;
  dummyCards?: CardRef[];
  dummyRules?: SelectedRule[];
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
  revealChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  revealChipLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
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

export function ResultsOverlay({
  responseText,
  validationSummary,
  error,
  isAsking,
  revealedBlocks,
  revealBlock,
  setRevealedBlocks,
  updatePanelRect,
  clearPanelRect,
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
  showRevealChips = false,
  holdToSpeakSlot,
}: ResultsOverlayProps) {
  const {
    text: textColor,
    textMuted: mutedColor,
    background: panelFill,
    border: borderColor,
    primary: accentIntrusionA,
    warning: warn,
  } = theme;

  const cardsCount = debugScenario
    ? dummyCards.length
    : (validationSummary?.cards?.length ?? 0);
  const rulesCount = debugScenario
    ? dummyRules.length
    : (validationSummary?.rules?.length ?? 0);
  const sourcesCount = debugScenario
    ? dummyRules.length + dummyCards.length
    : (validationSummary?.rules?.length ?? 0) +
      (validationSummary?.cards?.length ?? 0);

  const handleClusterReveal = (cluster: 'rules' | 'cards') => {
    if (cluster === 'rules') {
      setRevealedBlocks({
        answer: true,
        cards: false,
        rules: true,
        sources: false,
      });
      emitEvent('tapCitation');
    } else {
      setRevealedBlocks({
        answer: true,
        cards: true,
        rules: false,
        sources: false,
      });
      emitEvent('tapCard');
    }
  };

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
                <Pressable
                  style={[styles.revealChip, { borderColor }]}
                  onPress={() => revealBlock('answer')}
                >
                  <Text style={[styles.revealChipLabel, { color: textColor }]}>
                    Reveal Answer
                  </Text>
                </Pressable>
              )}
              {!revealedBlocks.cards && cardsCount > 0 && (
                <Pressable
                  style={[styles.revealChip, { borderColor }]}
                  onPress={() => revealBlock('cards')}
                >
                  <Text style={[styles.revealChipLabel, { color: textColor }]}>
                    Reveal Cards
                  </Text>
                </Pressable>
              )}
              {!revealedBlocks.rules && rulesCount > 0 && (
                <Pressable
                  style={[styles.revealChip, { borderColor }]}
                  onPress={() => revealBlock('rules')}
                >
                  <Text style={[styles.revealChipLabel, { color: textColor }]}>
                    Reveal Rules
                  </Text>
                </Pressable>
              )}
              {!revealedBlocks.sources && sourcesCount > 0 && (
                <Pressable
                  style={[styles.revealChip, { borderColor }]}
                  onPress={() => revealBlock('sources')}
                >
                  <Text style={[styles.revealChipLabel, { color: textColor }]}>
                    Reveal Sources
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {debugScenario ? (
            <>
              {revealedBlocks.answer && (
                <DeconPanel
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
                </DeconPanel>
              )}
              {dummyCards.length > 0 && revealedBlocks.cards && (
                <CardReferenceBlock
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
                <SelectedRulesBlock
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
                <DeconPanel
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
                </DeconPanel>
              )}
            </>
          ) : (
            <>
              {error ? (
                <DeconPanel
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
                >
                  <Text style={styles.errorText}>{error}</Text>
                </DeconPanel>
              ) : null}

              {revealedBlocks.answer && (
                <DeconPanel
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
                  {isAsking ? (
                    <View style={styles.responseLoadingRow}>
                      <ActivityIndicator size="small" color={textColor} />
                      <Text
                        style={[styles.responseLabelInline, { color: mutedColor }]}
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
                          style={[
                            styles.validationHint,
                            { color: mutedColor },
                          ]}
                        >
                          Corrected{' '}
                          {validationSummary.stats.unknownCardCount} name(s),{' '}
                          {validationSummary.stats.invalidRuleCount} rule(s)
                          invalid.
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
                </DeconPanel>
              )}

              {revealedBlocks.cards && (
                (() => {
                  const cards =
                    validationSummary?.cards?.map(c => ({
                      id: c.doc_id ?? c.raw,
                      name: c.canonical ?? c.raw,
                      imageUri: null,
                    })) ?? [];
                  if (cards.length === 0) {
                    return (
                      <DeconPanel
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
                        <Text style={[styles.responsePlaceholder, { color: mutedColor }]}>
                          No cards were selected for this response yet.
                        </Text>
                      </DeconPanel>
                    );
                  }
                  return (
                    <CardReferenceBlock
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
                })()
              )}
              {revealedBlocks.rules && (
                (() => {
                  const rules =
                    validationSummary?.rules?.map(r => ({
                      id: r.canonical ?? r.raw,
                      title: r.raw,
                      excerpt:
                        r.raw.length > 160
                          ? r.raw.slice(0, 160) + '…'
                          : r.raw,
                      used: r.status === 'valid',
                    })) ?? [];
                  if (rules.length === 0) {
                    return (
                      <DeconPanel
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
                        <Text style={[styles.responsePlaceholder, { color: mutedColor }]}>
                          No rules were selected for this response yet.
                        </Text>
                      </DeconPanel>
                    );
                  }
                  return (
                    <SelectedRulesBlock
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
                })()
              )}
              {validationSummary && revealedBlocks.sources ? (
                <DeconPanel
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
                </DeconPanel>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}
