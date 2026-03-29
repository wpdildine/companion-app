/**
 * Semantic channel: scrollable content surface (answer, cards, rules).
 * App composes VisualizationSurface + SemanticChannelView.
 * Theme and layout props are injected; no theme import.
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';

export type SemanticChannelViewProps = {
  contentPaddingTop: number;
  contentPaddingBottom: number;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
  /** Cycle 6: Play/Act-derived a11y label for the scroll region (orchestrator wins on error). */
  accessibilityContainerLabel?: string;
  /**
   * Act descriptor situation gloss (supplementary); Play/Act label remains canonical.
   * Omit when null/undefined/empty.
   */
  accessibilityContainerHint?: string | null;
  /** Cycle 8 Stage 2: optional non-interactive phase line; omit when null/undefined. */
  phaseCaptionText?: string | null;
  phaseCaptionColor?: string;
  children: React.ReactNode;
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollOverlay: {
    backgroundColor: 'transparent',
  },
  content: {
    flexGrow: 1,
  },
  phaseCaption: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    fontSize: 12,
    letterSpacing: 0.2,
  },
});

export function SemanticChannelView({
  contentPaddingTop,
  contentPaddingBottom,
  onScroll,
  scrollEventThrottle = 16,
  accessibilityContainerLabel,
  accessibilityContainerHint,
  phaseCaptionText,
  phaseCaptionColor,
  children,
}: SemanticChannelViewProps) {
  const showCaption =
    typeof phaseCaptionText === 'string' && phaseCaptionText.length > 0;
  const hint =
    typeof accessibilityContainerHint === 'string' &&
    accessibilityContainerHint.trim().length > 0
      ? accessibilityContainerHint.trim()
      : undefined;

  return (
    <ScrollView
      style={[styles.scroll, styles.scrollOverlay]}
      contentContainerStyle={{
        paddingTop: contentPaddingTop,
        paddingBottom: contentPaddingBottom,
      }}
      onScroll={onScroll}
      scrollEventThrottle={scrollEventThrottle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      accessibilityLabel={accessibilityContainerLabel}
      accessibilityHint={hint}
    >
      {showCaption ? (
        <Text
          style={[styles.phaseCaption, { color: phaseCaptionColor ?? '#888' }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {phaseCaptionText}
        </Text>
      ) : null}
      <View style={styles.content}>{children}</View>
    </ScrollView>
  );
}
