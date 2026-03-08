/**
 * Developer screen: wraps DevPanel from visualization for use in app debug overlay.
 * Theme and visualizationRef are passed by VoiceScreen.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RefObject } from 'react';
import { DevPanel, type DevPanelTheme } from '../../visualization';
import type { VisualizationEngineRef } from '../../visualization';

export type DevScreenProps = {
  visualizationRef: RefObject<VisualizationEngineRef | null>;
  onClose: () => void;
  theme: DevPanelTheme;
  stubCardsEnabled: boolean;
  stubRulesEnabled: boolean;
  onToggleStubCards: () => void;
  onToggleStubRules: () => void;
};

export function DevScreen({
  visualizationRef,
  onClose,
  theme,
  stubCardsEnabled,
  stubRulesEnabled,
  onToggleStubCards,
  onToggleStubRules,
}: DevScreenProps) {
  return (
    <>
      <DevPanel visualizationRef={visualizationRef} onClose={onClose} theme={theme} />
      <View style={[styles.stubPanel, { backgroundColor: theme.background }]}>
        <Text style={[styles.stubTitle, { color: theme.text }]}>Reference Stubs</Text>
        <Pressable style={styles.stubRow} onPress={onToggleStubCards}>
          <Text style={[styles.stubCheck, { color: theme.text }]}>
            {stubCardsEnabled ? '[x]' : '[ ]'}
          </Text>
          <Text style={[styles.stubLabel, { color: theme.textMuted }]}>Cards</Text>
        </Pressable>
        <Pressable style={styles.stubRow} onPress={onToggleStubRules}>
          <Text style={[styles.stubCheck, { color: theme.text }]}>
            {stubRulesEnabled ? '[x]' : '[ ]'}
          </Text>
          <Text style={[styles.stubLabel, { color: theme.textMuted }]}>Rules</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  stubPanel: {
    position: 'absolute',
    top: 88,
    right: 16,
    width: 180,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    zIndex: 30,
  },
  stubTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  stubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  stubCheck: {
    width: 28,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  stubLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
