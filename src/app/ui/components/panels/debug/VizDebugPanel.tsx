/**
 * Viz Debug Panel: HUD wrapper that renders the visualization debug panel
 * inside the same styling as the pipeline telemetry panel.
 */

import React, { useState } from 'react';
import { Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RefObject } from 'react';
import type { VisualizationEngineRef } from '../../../../../visualization';
import { DevPanel } from '../../../../../visualization';
import { NameShapingDebugOverlay } from '../../../../_experimental/nameShaping';
import type { NameShapingActions } from '../../../../_experimental/nameShaping';
import type { NameShapingState } from '../../../../_experimental/nameShaping';
import { PanelHeaderAction } from '../../controls';

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
  /** When both provided and non-null, the NameShaping section is rendered. No fallback state. */
  nameShapingState?: NameShapingState | null;
  nameShapingActions?: NameShapingActions | null;
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
  nameShapingState,
  nameShapingActions,
}: VizDebugPanelProps) {
  const [showVisualizationDev, setShowVisualizationDev] = useState(false);
  const window = Dimensions.get('window');
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(240, (maxWidth ?? window.width) - 24));
  const panelMaxHeight = Math.max(240, (maxHeight ?? window.height) - 24);
  const scrollMaxHeight = Math.max(160, panelMaxHeight - 96);

  const showNameShapingSection =
    nameShapingState != null && nameShapingActions != null;

  return (
    <View style={[styles.panel, { width: panelWidth, maxHeight: panelMaxHeight }]}>
      <PanelHeaderAction variant="close" onPress={onClose} surface="debug" />
      <Text style={styles.mainTitle}>Viz Debug</Text>
      <ScrollView style={[styles.scroll, { maxHeight: scrollMaxHeight }]} contentContainerStyle={styles.scrollContent}>
        <Pressable
          style={styles.sectionToggle}
          onPress={() => setShowVisualizationDev(prev => !prev)}
        >
          <Text style={styles.sectionToggleCheck}>
            {showVisualizationDev ? '[-]' : '[+]'}
          </Text>
          <Text style={styles.sectionToggleLabel}>Visualization Dev</Text>
        </Pressable>
        {showVisualizationDev && (
          <DevPanel
            visualizationRef={visualizationRef}
            onClose={onClose}
            theme={{ text: TEXT_PRIMARY, textMuted: TEXT_MUTED, background: 'transparent' }}
            variant="embed"
            showClose={false}
          />
        )}
        <Text style={styles.sectionTitle}>Reference Stubs</Text>
        <Pressable style={styles.stubRow} onPress={onToggleStubCards}>
          <Text style={styles.stubCheck}>{stubCardsEnabled ? '[x]' : '[ ]'}</Text>
          <Text style={styles.stubLabel}>Cards</Text>
        </Pressable>
        <Pressable style={styles.stubRow} onPress={onToggleStubRules}>
          <Text style={styles.stubCheck}>{stubRulesEnabled ? '[x]' : '[ ]'}</Text>
          <Text style={styles.stubLabel}>Rules</Text>
        </Pressable>
        {showNameShapingSection && (
          <>
            <Text style={styles.sectionTitle}>NameShaping</Text>
            <NameShapingDebugOverlay
              state={nameShapingState}
              actions={nameShapingActions}
              theme={{ text: TEXT_PRIMARY, textMuted: TEXT_MUTED }}
            />
          </>
        )}
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
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  sectionToggleCheck: {
    width: 28,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontMono,
    color: TEXT_PRIMARY,
  },
  sectionToggleLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontMono,
    color: TEXT_PRIMARY,
    fontWeight: '600',
  },
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
