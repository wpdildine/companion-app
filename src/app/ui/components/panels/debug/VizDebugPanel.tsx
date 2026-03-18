/**
 * Viz Debug Panel: HUD wrapper that renders the visualization debug panel
 * inside the same styling as the pipeline telemetry panel.
 */

import React, { useEffect, useState } from 'react';
import { Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RefObject } from 'react';
import type { VisualizationEngineRef } from '../../../../../visualization';
import { DevPanel } from '../../../../../visualization';
import { NameShapingDebugOverlay } from '../../../../_experimental/nameShaping';
import type { NameShapingActions } from '../../../../_experimental/nameShaping';
import type { NameShapingState } from '../../../../_experimental/nameShaping';
import { PanelHeaderAction } from '../../controls';
import {
  getVizRuntimeMode,
  setVizRuntimeMode,
  subscribeVizRuntimeMode,
  type VizRuntimeMode,
} from '../../overlays/VisualizationRuntimeMode';
import {
  VIZ_SUBSYSTEM_KEYS,
  getVizSubsystemEnabled,
  resetVizSubsystems,
  setVizSubsystem,
  subscribeVizSubsystemChange,
  type VizSubsystemKey,
} from '../../overlays/vizSubsystemToggles';

const VIZ_RUNTIME_MODE_OPTIONS: VizRuntimeMode[] = [
  'all_on',
  'all_off',
  'signal_apply_only',
  'spine_only',
  'r3f_only',
  'runtime_loop_only',
  'fallback_only',
];

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
  const [vizRuntimeMode, setVizRuntimeModeState] = useState(getVizRuntimeMode);
  useEffect(
    () => subscribeVizRuntimeMode(() => setVizRuntimeModeState(getVizRuntimeMode())),
    [],
  );
  const [, bumpSub] = useState(0);
  useEffect(
    () => subscribeVizSubsystemChange(() => bumpSub(n => n + 1)),
    [],
  );
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
        {typeof __DEV__ !== 'undefined' && __DEV__ && (
          <>
            <Text style={styles.sectionTitle}>Viz runtime isolation</Text>
            <Text style={styles.modeCurrent}>current: {vizRuntimeMode}</Text>
            {VIZ_RUNTIME_MODE_OPTIONS.map(m => (
              <Pressable
                key={m}
                style={styles.modeRow}
                onPress={() => setVizRuntimeMode(m)}
              >
                <Text
                  style={
                    m === vizRuntimeMode ? styles.modeRowActive : styles.modeRowLabel
                  }
                >
                  {m}
                </Text>
              </Pressable>
            ))}
            <Text style={styles.sectionTitle}>Viz subsystems (all_on + toggle)</Text>
            <Text style={styles.modeCurrent}>
              Tap row to toggle. Only `postFx` is wired to a consumer right now.
            </Text>
            <Pressable
              style={styles.modeRow}
              onPress={() => {
                resetVizSubsystems();
                const eng = visualizationRef.current;
                if (eng) eng.postFxEnabled = true;
              }}
            >
              <Text style={styles.modeRowActive}>Reset all subsystems ON</Text>
            </Pressable>
            {VIZ_SUBSYSTEM_KEYS.map((k: VizSubsystemKey) => {
              const on = getVizSubsystemEnabled(k);
              return (
                <Pressable
                  key={k}
                  style={styles.modeRow}
                  onPress={() => {
                    const nextEnabled = !on;
                    console.log(
                      `[VizDebugPanel:press] ${k} prevOn=${on} nextEnabled=${nextEnabled}`,
                    );
                    setVizSubsystem(k, nextEnabled);
                    if (k === 'postFx') {
                      const eng = visualizationRef.current;
                      if (eng) {
                        eng.postFxEnabled = nextEnabled;
                      }
                    }
                  }}
                >
                  <Text style={on ? styles.modeRowLabel : styles.modeRowActive}>
                    [{on ? 'ON' : 'OFF'}] {k}
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}
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
  modeCurrent: {
    color: TEXT_MUTED,
    fontSize: 11,
    fontFamily: fontMono,
    marginBottom: 6,
  },
  modeRow: {
    paddingVertical: 4,
  },
  modeRowLabel: {
    color: TEXT_MUTED,
    fontSize: 12,
    fontFamily: fontMono,
  },
  modeRowActive: {
    color: '#7ee787',
    fontSize: 12,
    fontFamily: fontMono,
    fontWeight: '600',
  },
});
