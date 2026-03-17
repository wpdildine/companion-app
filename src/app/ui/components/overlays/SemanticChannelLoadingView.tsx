/**
 * Full-surface loading state for the semantic channel (e.g. loading speech recognition).
 * Consumes theme from composition.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
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
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color={theme.primary}
          style={styles.loader}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    alignItems: 'center',
  },
  loader: {
    marginBottom: 12,
  },
  hint: {
    fontSize: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
});
