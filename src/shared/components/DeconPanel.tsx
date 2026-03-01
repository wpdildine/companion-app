/**
 * Translucent container for decon aesthetic: section headers, labels, blocks.
 * Use for CardReferenceBlock, SelectedRulesBlock, and other "controlled anarchy"
 * containers. Body text stays outside; only headers/labels get decon treatment.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

export type DeconPanelProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Override default translucent background (e.g. rgba). */
  backgroundColor?: string;
};

const DEFAULT_BG = 'rgba(255,255,255,0.06)';

export function DeconPanel({
  children,
  style,
  backgroundColor = DEFAULT_BG,
}: DeconPanelProps) {
  return (
    <View style={[styles.panel, { backgroundColor }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
    borderRadius: 8,
  },
});
