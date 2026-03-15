/**
 * Full-surface loading state for the semantic channel (e.g. loading speech recognition).
 * Consumes theme from composition.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../../../../theme';

export type SemanticChannelLoadingViewProps = {
  theme: Theme;
  paddingTop: number;
};

export function SemanticChannelLoadingView({
  theme,
  paddingTop,
}: SemanticChannelLoadingViewProps) {
  return (
    <View
      style={[
        styles.container,
        { paddingTop, backgroundColor: theme.background },
      ]}
    >
      <Text style={[styles.title, { color: theme.text }]}>Voice</Text>
      <ActivityIndicator
        size="large"
        color={theme.primary}
        style={styles.loader}
      />
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Loading speech recognition…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loader: {
    marginTop: 24,
  },
  hint: {
    marginTop: 12,
    fontSize: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
});
