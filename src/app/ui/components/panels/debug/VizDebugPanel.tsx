/**
 * Viz Debug Panel: dev-only HUD with runtime controls and visualization debug.
 * Uses same shell as pipeline telemetry panel. No harness/trace instrumentation.
 */

import React, { useEffect, useState } from 'react';
import { Dimensions, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RefObject } from 'react';
import type { VisualizationEngineRef } from '../../../../../visualization';
import { DevPanel } from '../../../../../visualization';
import { NameShapingDebugOverlay } from '../../../../_experimental/nameShaping';
import type { NameShapingActions } from '../../../../_experimental/nameShaping';
import type { NameShapingState } from '../../../../_experimental/nameShaping';
import { PanelHeaderAction } from '../../controls';
import {
  VIZ_SUBSYSTEM_KEYS,
  getVizSubsystemEnabled,
  presetAllVizSubsystemsOff,
  presetAllVizSubsystemsOn,
  setVizSubsystem,
  subscribeVizSubsystemChange,
  type VizSubsystemKey,
} from '../../overlays/vizSubsystemToggles';
import { DebugMenuSection } from './DebugMenuSection';
import { DebugMenuRow } from './DebugMenuRow';

const PANEL_WIDTH = 360;
const BG = 'rgba(15,17,21,0.9)';
const BORDER = '#2a2f38';
const TEXT_PRIMARY = '#ffffff';
const TEXT_MUTED = '#8b949e';
const ACCENT = '#7ee787';

const fontMono = Platform.select({ ios: 'Menlo', android: 'monospace' });

function syncPostFxFromSubsystem(
  visualizationRef: RefObject<VisualizationEngineRef | null>,
): void {
  const eng = visualizationRef.current;
  if (eng) {
    eng.postFxEnabled = getVizSubsystemEnabled('postFx');
  }
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

  const toggleControl = (on: boolean) => (
    <Text style={[styles.toggleRight, on && styles.toggleOn]}>
      {on ? 'ON' : 'OFF'}
    </Text>
  );

  return (
    <View style={[styles.panel, { width: panelWidth, maxHeight: panelMaxHeight }]}>
      <PanelHeaderAction variant="close" onPress={onClose} surface="debug" />
      <Text style={styles.mainTitle}>Viz Debug</Text>
      <ScrollView
        style={[styles.scroll, { maxHeight: scrollMaxHeight }]}
        contentContainerStyle={styles.scrollContent}
      >
        {typeof __DEV__ !== 'undefined' && __DEV__ ? (
          <>
            <Text style={styles.groupLabel}>Runtime Controls</Text>
            <DebugMenuSection title="Runtime Presets" defaultExpanded>
              <DebugMenuRow
                label="All on"
                onPress={() => {
                  presetAllVizSubsystemsOn();
                  syncPostFxFromSubsystem(visualizationRef);
                }}
                right={<Text style={styles.presetAction}>Apply</Text>}
              />
              <DebugMenuRow
                label="All off"
                onPress={() => {
                  presetAllVizSubsystemsOff();
                  syncPostFxFromSubsystem(visualizationRef);
                }}
                right={<Text style={styles.presetAction}>Apply</Text>}
              />
            </DebugMenuSection>
            <DebugMenuSection title="Subsystem Gates" defaultExpanded>
              {VIZ_SUBSYSTEM_KEYS.map((k: VizSubsystemKey) => {
                const on = getVizSubsystemEnabled(k);
                return (
                  <DebugMenuRow
                    key={k}
                    label={k}
                    onPress={() => {
                      const next = !on;
                      setVizSubsystem(k, next);
                      if (k === 'postFx') {
                        const eng = visualizationRef.current;
                        if (eng) eng.postFxEnabled = next;
                      }
                    }}
                    right={toggleControl(on)}
                  />
                );
              })}
            </DebugMenuSection>
          </>
        ) : (
          <Text style={styles.devOnlyNote}>Runtime presets and gates: dev build only.</Text>
        )}

        <DebugMenuSection title="Auxiliary" defaultExpanded={false} deemphasized>
          <DebugMenuSection title="Visualization Dev" defaultExpanded={false}>
            <DevPanel
              visualizationRef={visualizationRef}
              onClose={onClose}
              theme={{ text: TEXT_PRIMARY, textMuted: TEXT_MUTED, background: 'transparent' }}
              variant="embed"
              showClose={false}
            />
          </DebugMenuSection>
          <DebugMenuSection title="Reference Stubs" defaultExpanded={false}>
            <DebugMenuRow
              label="Cards"
              onPress={onToggleStubCards}
              right={toggleControl(stubCardsEnabled)}
            />
            <DebugMenuRow
              label="Rules"
              onPress={onToggleStubRules}
              right={toggleControl(stubRulesEnabled)}
            />
          </DebugMenuSection>
          {showNameShapingSection ? (
            <DebugMenuSection title="NameShaping" defaultExpanded={false}>
              <NameShapingDebugOverlay
                state={nameShapingState!}
                actions={nameShapingActions!}
                theme={{ text: TEXT_PRIMARY, textMuted: TEXT_MUTED }}
              />
            </DebugMenuSection>
          ) : null}
        </DebugMenuSection>
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
  groupLabel: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontFamily: fontMono,
    fontWeight: '700',
    marginBottom: 6,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 16 },
  presetAction: {
    color: ACCENT,
    fontSize: 12,
    fontFamily: fontMono,
    fontWeight: '600',
  },
  toggleRight: {
    fontSize: 12,
    fontFamily: fontMono,
    color: TEXT_MUTED,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'right',
  },
  toggleOn: {
    color: ACCENT,
  },
  devOnlyNote: {
    color: TEXT_MUTED,
    fontSize: 11,
    fontFamily: fontMono,
    marginBottom: 8,
  },
});
