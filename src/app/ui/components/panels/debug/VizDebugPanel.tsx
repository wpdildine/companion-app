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
const ACCENT = '#7ee787';

const fontMono = Platform.select({ ios: 'Menlo', android: 'monospace' });

function MenuRow({
  label,
  sublabel,
  onPress,
  right,
}: {
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right: React.ReactNode;
}) {
  const inner = (
    <View style={styles.rowInner}>
      <View style={styles.left}>
        <Text style={styles.label}>{label}</Text>
        {sublabel ? (
          <Text style={styles.sublabel} numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {inner}
      </Pressable>
    );
  }

  return inner;
}

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
        <MenuRow
          label="Visualization Dev"
          onPress={() => setShowVisualizationDev(prev => !prev)}
          right={<Text style={styles.chevronText}>{showVisualizationDev ? '[-]' : '[+]'}</Text>}
        />
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
        <MenuRow
          label="Cards"
          onPress={onToggleStubCards}
          right={
            <Text
              style={[
                styles.toggleRight,
                stubCardsEnabled && styles.toggleOn,
              ]}
            >
              {stubCardsEnabled ? '[x]' : '[ ]'}
            </Text>
          }
        />
        <MenuRow
          label="Rules"
          onPress={onToggleStubRules}
          right={
            <Text
              style={[
                styles.toggleRight,
                stubRulesEnabled && styles.toggleOn,
              ]}
            >
              {stubRulesEnabled ? '[x]' : '[ ]'}
            </Text>
          }
        />
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
    marginBottom: 6,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontFamily: fontMono,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 16 },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    minHeight: 28,
  },
  left: { flex: 1, marginRight: 8 },
  right: { alignItems: 'flex-end', justifyContent: 'center' },
  label: {
    fontSize: 12,
    fontFamily: fontMono,
    color: TEXT_MUTED,
  },
  sublabel: {
    fontSize: 10,
    fontFamily: fontMono,
    color: TEXT_MUTED,
    opacity: 0.75,
    marginTop: 2,
  },
  chevronText: {
    fontSize: 12,
    fontFamily: fontMono,
    color: TEXT_PRIMARY,
    fontWeight: '700',
  },
  toggleRight: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontMono,
    color: TEXT_MUTED,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'right',
  },
  toggleOn: {
    color: ACCENT,
  },
});
