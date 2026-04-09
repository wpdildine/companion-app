/**
 * Debug Panel: dev-only HUD with runtime controls, log gates, and visualization debug.
 * Uses same shell as pipeline telemetry panel. No harness/trace instrumentation.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { RefObject } from 'react';
import type { VisualizationEngineRef } from '../../../../../visualization';
import { DevPanel } from '../../../../../visualization';
import { PanelHeaderAction } from '../../controls';
import {
  getSttOverride,
  getSttProvider,
  setSttOverride,
} from '../../../../../shared/config/endpointConfig';
import {
  VIZ_SUBSYSTEM_KEYS,
  getVizSubsystemEnabled,
  presetAllVizSubsystemsOff,
  presetAllVizSubsystemsOn,
  setVizSubsystem,
  subscribeVizSubsystemChange,
  type VizSubsystemKey,
} from '../../overlays/vizSubsystemToggles';
import { logInfo } from '../../../../../shared/logging';
import type {
  PlaybackPosture,
  TreatedDebugRenderOverrides,
} from '../../../../agent';
import { DebugMenuSection } from './DebugMenuSection';
import { DebugMenuRow } from './DebugMenuRow';
import { SPEECH_LAB_PRESETS } from './speechLabPresets';

const PANEL_WIDTH = 360;
const BG = 'rgba(15,17,21,0.9)';
const BORDER = '#2a2f38';
const TEXT_PRIMARY = '#ffffff';
const TEXT_MUTED = '#8b949e';
const ACCENT = '#7ee787';

const fontMono = Platform.select({ ios: 'Menlo', android: 'monospace' });

function getLogGates(): Record<string, boolean> | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as Record<string, unknown>).__ATLAS_LOG_GATES__ as
    | Record<string, boolean>
    | undefined;
}

function syncPostFxFromSubsystem(
  visualizationRef: RefObject<VisualizationEngineRef | null>,
): void {
  const eng = visualizationRef.current;
  if (eng) {
    eng.postFxEnabled = getVizSubsystemEnabled('postFx');
  }
}

function clampNumber(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Base shaping + synth pacing + optional layer2 desync; only finite numbers; layer2 on Play only. */
function buildTreatedDebugOverridesFromSpeechLab(
  hpStr: string,
  leadStr: string,
  gainStr: string,
  speechRateStr: string,
  sentencePauseStr: string,
  commaPauseStr: string,
  layer2On: boolean,
  layer2DelayStr: string,
  layer2GainStr: string,
): TreatedDebugRenderOverrides | undefined {
  const out: TreatedDebugRenderOverrides = {};
  const h = hpStr.trim();
  if (h !== '') {
    const n = Number(h);
    if (Number.isFinite(n)) out.renderHighPassHz = n;
  }
  const l = leadStr.trim();
  if (l !== '') {
    const n = Number(l);
    if (Number.isFinite(n)) out.renderLeadSilenceMs = n;
  }
  const g = gainStr.trim();
  if (g !== '') {
    const n = Number(g);
    if (Number.isFinite(n)) out.renderPostGainDb = n;
  }
  const sr = speechRateStr.trim();
  if (sr !== '') {
    const n = Number(sr);
    if (Number.isFinite(n) && n > 0) out.lengthScale = clampNumber(n, 1.0, 2.5);
  }
  const sp = sentencePauseStr.trim();
  if (sp !== '') {
    const n = Number(sp);
    if (Number.isFinite(n)) {
      out.interSentenceSilenceMs = Math.round(clampNumber(n, 200, 500));
    }
  }
  const cp = commaPauseStr.trim();
  if (cp !== '') {
    const n = Number(cp);
    if (Number.isFinite(n)) {
      out.interCommaSilenceMs = Math.round(clampNumber(n, 100, 300));
    }
  }
  if (layer2On) {
    out.renderLayer2Enabled = true;
    const d = layer2DelayStr.trim();
    if (d !== '') {
      const n = Number(d);
      if (Number.isFinite(n) && n >= 0) out.renderLayer2DelayMs = n;
    }
    const lg = layer2GainStr.trim();
    if (lg !== '') {
      const n = Number(lg);
      if (Number.isFinite(n)) out.renderLayer2GainDb = n;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
  /** Dev-only: real orchestrator playback path (no duplicate TTS pipeline). */
  onSpeechLabPlay: (
    text: string,
    options?: {
      posture?: PlaybackPosture;
      treatedDebugRenderOverrides?: TreatedDebugRenderOverrides;
    },
  ) => void;
  onSpeechLabCancel: () => void;
  /** Observational readout only; panel does not interpret lifecycle. */
  speechLabReadout?: { lifecycle: string; error: string | null };
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
  onSpeechLabPlay,
  onSpeechLabCancel,
  speechLabReadout,
}: VizDebugPanelProps) {
  const [, bumpSub] = useState(0);
  const [, forceLogGatesRefresh] = useState(0);
  const [, bumpSttOverrideUi] = useState(0);
  const [speechPosture, setSpeechPosture] = useState<PlaybackPosture>('default');
  const [speechPresetId, setSpeechPresetId] = useState(SPEECH_LAB_PRESETS[0]!.id);
  const [speechFreeform, setSpeechFreeform] = useState('');
  const [hpHz, setHpHz] = useState('');
  const [leadMs, setLeadMs] = useState('');
  const [gainDb, setGainDb] = useState('');
  const [speechRate, setSpeechRate] = useState('');
  const [sentencePauseMs, setSentencePauseMs] = useState('');
  const [commaPauseMs, setCommaPauseMs] = useState('');
  const [layer2Enabled, setLayer2Enabled] = useState(false);
  const [layer2DelayMs, setLayer2DelayMs] = useState('');
  const [layer2GainDb, setLayer2GainDb] = useState('');
  const selectedPresetText = useMemo(
    () => SPEECH_LAB_PRESETS.find(p => p.id === speechPresetId)?.text ?? '',
    [speechPresetId],
  );
  useEffect(
    () => subscribeVizSubsystemChange(() => bumpSub(n => n + 1)),
    [],
  );
  const window = Dimensions.get('window');
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(240, (maxWidth ?? window.width) - 24));
  const panelMaxHeight = Math.max(240, (maxHeight ?? window.height) - 24);
  const scrollMaxHeight = Math.max(160, panelMaxHeight - 96);

  const toggleControl = (on: boolean) => (
    <Text style={[styles.toggleRight, on && styles.toggleOn]}>
      {on ? 'ON' : 'OFF'}
    </Text>
  );

  return (
    <View style={[styles.panel, { width: panelWidth, maxHeight: panelMaxHeight }]}>
      <PanelHeaderAction variant="close" onPress={onClose} surface="debug" />
      <Text style={styles.mainTitle}>Debug Panel</Text>
      <ScrollView
        style={[styles.scroll, { maxHeight: scrollMaxHeight }]}
        contentContainerStyle={styles.scrollContent}
      >
        {typeof __DEV__ !== 'undefined' && __DEV__ ? (
          <>
            <Text style={styles.groupLabel}>Runtime Controls</Text>
            <DebugMenuSection title="Log Gates">
              <DebugMenuRow
                label="Disable hot path logs"
                onPress={() => {
                  const fn = (globalThis as Record<string, unknown>)
                    .disableHotPathLogs as (() => void) | undefined;
                  if (typeof fn === 'function') fn();
                  forceLogGatesRefresh(n => n + 1);
                }}
                right={<Text style={styles.presetAction}>Run</Text>}
              />
              <DebugMenuRow
                label="Enable all logs"
                onPress={() => {
                  const fn = (globalThis as Record<string, unknown>)
                    .enableAllLogs as (() => void) | undefined;
                  if (typeof fn === 'function') fn();
                  forceLogGatesRefresh(n => n + 1);
                }}
                right={<Text style={styles.presetAction}>Run</Text>}
              />
              {(() => {
                const gates = getLogGates();
                const onSettlement = gates?.settlementPayload !== false;
                const onPlayback = gates?.playbackHandoff !== false;
                const onRequestDebug = gates?.requestDebug !== false;
                return (
                  <>
                    <DebugMenuRow
                      label="Settlement payload"
                      onPress={() => {
                        if (gates) {
                          gates.settlementPayload = !onSettlement;
                          forceLogGatesRefresh(n => n + 1);
                        }
                      }}
                      right={toggleControl(onSettlement)}
                    />
                    <DebugMenuRow
                      label="Playback handoff"
                      onPress={() => {
                        if (gates) {
                          gates.playbackHandoff = !onPlayback;
                          forceLogGatesRefresh(n => n + 1);
                        }
                      }}
                      right={toggleControl(onPlayback)}
                    />
                    <DebugMenuRow
                      label="Request debug"
                      onPress={() => {
                        if (gates) {
                          gates.requestDebug = !onRequestDebug;
                          forceLogGatesRefresh(n => n + 1);
                        }
                      }}
                      right={toggleControl(onRequestDebug)}
                    />
                  </>
                );
              })()}
            </DebugMenuSection>
            <DebugMenuSection title="STT provider (override)">
              {(() => {
                const ov = getSttOverride();
                const env = getSttProvider();
                const activeLabel =
                  ov != null ? `override=${ov}` : `env=${env}`;
                return (
                  <Text style={styles.sttHint} numberOfLines={2}>
                    Next listen uses snapshot: {activeLabel}
                  </Text>
                );
              })()}
              <DebugMenuRow
                label="local"
                onPress={() => {
                  setSttOverride('local');
                  logInfo('AgentSurface', 'stt dev control set override', {
                    mode: 'local',
                  });
                  bumpSttOverrideUi(n => n + 1);
                }}
                right={<Text style={styles.presetAction}>Set</Text>}
              />
              <DebugMenuRow
                label="remote"
                onPress={() => {
                  setSttOverride('remote');
                  logInfo('AgentSurface', 'stt dev control set override', {
                    mode: 'remote',
                  });
                  bumpSttOverrideUi(n => n + 1);
                }}
                right={<Text style={styles.presetAction}>Set</Text>}
              />
              <DebugMenuRow
                label="remote_with_local_fallback"
                onPress={() => {
                  setSttOverride('remote_with_local_fallback');
                  logInfo('AgentSurface', 'stt dev control set override', {
                    mode: 'remote_with_local_fallback',
                  });
                  bumpSttOverrideUi(n => n + 1);
                }}
                right={<Text style={styles.presetAction}>Set</Text>}
              />
              <DebugMenuRow
                label="Clear override (use env)"
                onPress={() => {
                  setSttOverride(null);
                  logInfo('AgentSurface', 'stt dev control clear override', {});
                  bumpSttOverrideUi(n => n + 1);
                }}
                right={<Text style={styles.presetAction}>Clear</Text>}
              />
            </DebugMenuSection>
            <DebugMenuSection title="Speech Lab">
              <Text style={styles.sttHint} numberOfLines={3}>
                Freeform overrides preset. playText / cancelPlayback (real path).
              </Text>
              {speechLabReadout ? (
                <Text style={styles.sttHint} numberOfLines={3}>
                  lifecycle={speechLabReadout.lifecycle}
                  {speechLabReadout.error
                    ? ` error=${speechLabReadout.error}`
                    : ''}
                </Text>
              ) : null}
              <Text style={styles.speechSubLabel}>Posture</Text>
              {(['default', 'calm', 'treated'] as const).map(p => (
                <DebugMenuRow
                  key={p}
                  label={p}
                  onPress={() => setSpeechPosture(p)}
                  right={
                    <Text
                      style={[
                        styles.toggleRight,
                        speechPosture === p && styles.toggleOn,
                      ]}
                    >
                      {speechPosture === p ? 'ON' : 'set'}
                    </Text>
                  }
                />
              ))}
              {speechPosture === 'treated' ? (
                <>
                  <Text style={styles.speechSubLabel}>Treated overrides</Text>
                  <Text style={styles.sttHint} numberOfLines={3}>
                    High-pass (Hz), lead silence (ms), gain (dB). Pacing: speech rate (lengthScale
                    1.0–2.5), sentence pause (ms 200–500), comma pause (ms 100–300). Apply on Play
                    only.
                  </Text>
                  <TextInput
                    style={styles.speechOverrideInput}
                    value={hpHz}
                    onChangeText={setHpHz}
                    placeholder="High-pass (Hz)"
                    placeholderTextColor={TEXT_MUTED}
                    keyboardType="numbers-and-punctuation"
                    testID="speech-lab-treated-highpass-hz"
                  />
                  <TextInput
                    style={styles.speechOverrideInput}
                    value={leadMs}
                    onChangeText={setLeadMs}
                    placeholder="Lead silence (ms)"
                    placeholderTextColor={TEXT_MUTED}
                    keyboardType="numbers-and-punctuation"
                    testID="speech-lab-treated-lead-ms"
                  />
                  <TextInput
                    style={styles.speechOverrideInput}
                    value={gainDb}
                    onChangeText={setGainDb}
                    placeholder="Gain (dB)"
                    placeholderTextColor={TEXT_MUTED}
                    keyboardType="numbers-and-punctuation"
                    testID="speech-lab-treated-gain-db"
                  />
                  <TextInput
                    style={styles.speechOverrideInput}
                    value={speechRate}
                    onChangeText={setSpeechRate}
                    placeholder="Speech rate (lengthScale, 1.0–2.5, default ~2.25)"
                    placeholderTextColor={TEXT_MUTED}
                    keyboardType="numbers-and-punctuation"
                    testID="speech-lab-treated-speech-rate"
                  />
                  <TextInput
                    style={styles.speechOverrideInput}
                    value={sentencePauseMs}
                    onChangeText={setSentencePauseMs}
                    placeholder="Sentence pause (ms)"
                    placeholderTextColor={TEXT_MUTED}
                    keyboardType="numbers-and-punctuation"
                    testID="speech-lab-treated-sentence-pause-ms"
                  />
                  <TextInput
                    style={styles.speechOverrideInput}
                    value={commaPauseMs}
                    onChangeText={setCommaPauseMs}
                    placeholder="Comma pause (ms)"
                    placeholderTextColor={TEXT_MUTED}
                    keyboardType="numbers-and-punctuation"
                    testID="speech-lab-treated-comma-pause-ms"
                  />
                  <Text style={styles.speechSubLabel}>Layer 2 desync</Text>
                  <Text style={styles.sttHint} numberOfLines={2}>
                    Delayed wet mix (Piper native). Apply on Play only.
                  </Text>
                  <DebugMenuRow
                    label="Layer 2 on"
                    onPress={() => setLayer2Enabled(v => !v)}
                    right={toggleControl(layer2Enabled)}
                  />
                  <TextInput
                    style={styles.speechOverrideInput}
                    value={layer2DelayMs}
                    onChangeText={setLayer2DelayMs}
                    placeholder="Layer 2 delay (ms)"
                    placeholderTextColor={TEXT_MUTED}
                    keyboardType="numbers-and-punctuation"
                    testID="speech-lab-treated-layer2-delay-ms"
                  />
                  <TextInput
                    style={styles.speechOverrideInput}
                    value={layer2GainDb}
                    onChangeText={setLayer2GainDb}
                    placeholder="Layer 2 gain (dB, wet tap)"
                    placeholderTextColor={TEXT_MUTED}
                    keyboardType="numbers-and-punctuation"
                    testID="speech-lab-treated-layer2-gain-db"
                  />
                  <DebugMenuRow
                    label="Reset treated render defaults"
                    onPress={() => {
                      setHpHz('');
                      setLeadMs('');
                      setGainDb('');
                      setSpeechRate('');
                      setSentencePauseMs('');
                      setCommaPauseMs('');
                      setLayer2Enabled(false);
                      setLayer2DelayMs('');
                      setLayer2GainDb('');
                    }}
                    right={<Text style={styles.presetAction}>Clear</Text>}
                  />
                </>
              ) : null}
              <Text style={styles.speechSubLabel}>Preset</Text>
              {SPEECH_LAB_PRESETS.map(pr => (
                <DebugMenuRow
                  key={pr.id}
                  label={pr.label}
                  onPress={() => setSpeechPresetId(pr.id)}
                  right={
                    <Text
                      style={[
                        styles.toggleRight,
                        speechPresetId === pr.id && styles.toggleOn,
                      ]}
                    >
                      {speechPresetId === pr.id ? 'ON' : 'set'}
                    </Text>
                  }
                />
              ))}
              <Text style={styles.speechSubLabel}>Freeform</Text>
              <TextInput
                style={styles.speechInput}
                value={speechFreeform}
                onChangeText={setSpeechFreeform}
                placeholder="Overrides preset when non-empty"
                placeholderTextColor={TEXT_MUTED}
                multiline
                editable
              />
              <DebugMenuRow
                label="Play"
                onPress={() => {
                  const raw = speechFreeform.trim();
                  const text = raw.length > 0 ? raw : selectedPresetText;
                  if (!text.trim()) return;
                  const bag =
                    speechPosture === 'treated'
                      ? buildTreatedDebugOverridesFromSpeechLab(
                          hpHz,
                          leadMs,
                          gainDb,
                          speechRate,
                          sentencePauseMs,
                          commaPauseMs,
                          layer2Enabled,
                          layer2DelayMs,
                          layer2GainDb,
                        )
                      : undefined;
                  void onSpeechLabPlay(text, {
                    posture: speechPosture,
                    ...(bag ? { treatedDebugRenderOverrides: bag } : {}),
                  });
                }}
                right={<Text style={styles.presetAction}>Run</Text>}
              />
              <DebugMenuRow
                label="Stop / cancel playback"
                onPress={onSpeechLabCancel}
                right={<Text style={styles.presetAction}>Run</Text>}
              />
            </DebugMenuSection>
            <DebugMenuSection title="Runtime Presets">
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
            <DebugMenuSection title="Subsystem Gates">
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
  sttHint: {
    color: TEXT_MUTED,
    fontSize: 10,
    fontFamily: fontMono,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  speechSubLabel: {
    color: TEXT_PRIMARY,
    fontSize: 11,
    fontFamily: fontMono,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 2,
  },
  speechInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    color: TEXT_PRIMARY,
    fontFamily: fontMono,
    fontSize: 11,
    minHeight: 56,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
    textAlignVertical: 'top',
  },
  speechOverrideInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    color: TEXT_PRIMARY,
    fontFamily: fontMono,
    fontSize: 11,
    minHeight: 34,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 4,
  },
});
