/**
 * Viz Debug Panel: HUD wrapper that renders the visualization debug panel
 * inside the same styling as the pipeline telemetry panel.
 */

import React from 'react';
import { Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RefObject } from 'react';
import type { VisualizationEngineRef } from '../../visualization';
import { DevPanel } from '../../visualization';

const PANEL_WIDTH = 360;
const BG = 'rgba(15,17,21,0.9)';
const BORDER = '#2a2f38';
const TEXT_PRIMARY = '#ffffff';
const TEXT_MUTED = '#8b949e';

const fontMono = Platform.select({ ios: 'Menlo', android: 'monospace' });

export type VizDebugPanelProps = {
  visualizationRef: RefObject<VisualizationEngineRef | null>;
  onClose: () => void;
  stubCardsEnabled: boolean;
  stubRulesEnabled: boolean;
  onToggleStubCards: () => void;
  onToggleStubRules: () => void;
  maxHeight?: number;
  maxWidth?: number;
};

export function VizDebugPanel({
  visualizationRef,
  onClose,
  stubCardsEnabled,
  stubRulesEnabled,
  onToggleStubCards,
  onToggleStubRules,
  maxHeight,
  maxWidth,
}: VizDebugPanelProps) {
  const window = Dimensions.get('window');
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(240, (maxWidth ?? window.width) - 24));
  const panelMaxHeight = Math.max(240, (maxHeight ?? window.height) - 24);
  const scrollMaxHeight = Math.max(160, panelMaxHeight - 96);

  return (
    <View style={[styles.panel, { width: panelWidth, maxHeight: panelMaxHeight }]}>
      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
      <Text style={styles.mainTitle}>Viz Debug</Text>
      <ScrollView style={[styles.scroll, { maxHeight: scrollMaxHeight }]} contentContainerStyle={styles.scrollContent}>
        <DevPanel
          visualizationRef={visualizationRef}
          onClose={onClose}
          theme={{ text: TEXT_PRIMARY, textMuted: TEXT_MUTED, background: 'transparent' }}
          variant="embed"
          showClose={false}
        />
        <Text style={styles.sectionTitle}>Reference Stubs</Text>
        <Pressable style={styles.stubRow} onPress={onToggleStubCards}>
          <Text style={styles.stubCheck}>{stubCardsEnabled ? '[x]' : '[ ]'}</Text>
          <Text style={styles.stubLabel}>Cards</Text>
        </Pressable>
        <Pressable style={styles.stubRow} onPress={onToggleStubRules}>
          <Text style={styles.stubCheck}>{stubRulesEnabled ? '[x]' : '[ ]'}</Text>
          <Text style={styles.stubLabel}>Rules</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 10,
    paddingTop: 8,
    overflow: 'hidden',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  closeText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: fontMono,
    fontWeight: '600',
  },
  mainTitle: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: fontMono,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionTitle: {
    color: TEXT_MUTED,
    fontSize: 12,
    fontFamily: fontMono,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 16 },
  stubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  stubCheck: {
    width: 28,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontMono,
    color: TEXT_PRIMARY,
  },
  stubLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontMono,
    color: TEXT_MUTED,
  },
});
