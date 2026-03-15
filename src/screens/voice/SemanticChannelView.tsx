/**
 * Semantic channel: scrollable content surface (answer, cards, rules).
 * App composes VisualizationSurface + SemanticChannelView.
 * Theme and layout props are injected; no theme import.
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';

export type SemanticChannelViewProps = {
  contentPaddingTop: number;
  contentPaddingBottom: number;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
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
});

export function SemanticChannelView({
  contentPaddingTop,
  contentPaddingBottom,
  onScroll,
  scrollEventThrottle = 16,
  children,
}: SemanticChannelViewProps) {
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
    >
      <View style={styles.content}>{children}</View>
    </ScrollView>
  );
}
