/**
 * Main voice UI: hold-to-speak trigger and scrollable content (answer, cards, rules).
 * App composes NodeMapSurface + UserVoiceView (or DevScreen when debug).
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

export type UserVoiceViewProps = {
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

export function UserVoiceView({
  contentPaddingTop,
  contentPaddingBottom,
  onScroll,
  scrollEventThrottle = 16,
  children,
}: UserVoiceViewProps) {
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
