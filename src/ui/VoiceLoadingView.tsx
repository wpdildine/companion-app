/**
 * Loading state for the voice screen. Consumes theme from App.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';

export function VoiceLoadingView({
  theme,
  paddingTop,
}: {
  theme: Theme;
  paddingTop: number;
}) {
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
