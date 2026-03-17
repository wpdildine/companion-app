/**
 * Name Shaping debug overlay: debug-only scaffold for manual subsystem exercise.
 * Preserved while Name Shaping development is paused so future work can resume
 * from a working inspection surface without affecting the core MTG assistant path.
 */

import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../../ui/components/controls';
import { logInfo } from '../../../../shared/logging';
import type { NameShapingActions } from '../runtime/useNameShapingState';
import type { NameShapingState } from '../foundation/nameShapingTypes';
import { buildCardNameSignature } from '../foundation/buildCardNameSignature';
import {
  SELECTOR_METADATA,
  SELECTOR_ORDER,
  type NameShapingSelector,
} from '../foundation/nameShapingConstants';

const fontMono = Platform.select({ ios: 'Menlo', android: 'monospace' });

const SAMPLE_CARD_NAMES = [
  'Urborg',
  'Ayesha',
  'Yawgmoth',
  'Gitrog',
  'Atraxa',
  'Sheoldred',
] as const;

export type NameShapingDebugOverlayTheme = {
  text: string;
  textMuted: string;
};

export type NameShapingDebugOverlayProps = {
  state: NameShapingState;
  actions: NameShapingActions;
  theme?: NameShapingDebugOverlayTheme;
};

function formatSignature(sig: readonly string[]): string {
  return sig.length === 0 ? '—' : sig.join(', ');
}

function Row({
  label,
  value,
  muted = false,
  theme,
}: {
  label: string;
  value: string | number | null | undefined;
  muted?: boolean;
  theme: NameShapingDebugOverlayTheme;
}) {
  const v = value == null ? '—' : String(value);
  return (
    <Text style={[styles.row, { color: theme.text }, muted && { color: theme.textMuted }]} numberOfLines={3}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}: </Text>
      <Text style={[styles.value, { color: theme.text }]}>{v}</Text>
    </Text>
  );
}

function SectionTitle({ title, theme }: { title: string; theme: NameShapingDebugOverlayTheme }) {
  return (
    <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
  );
}

export function NameShapingDebugOverlay({
  state,
  actions,
  theme = { text: '#ffffff', textMuted: '#8b949e' },
}: NameShapingDebugOverlayProps) {
  const [showPipeline, setShowPipeline] = useState(true);
  const [reverseInput, setReverseInput] = useState('');
  const [inspectedName, setInspectedName] = useState<string | null>(null);

  const reverseResult =
    inspectedName !== null ? buildCardNameSignature(inspectedName) : null;

  const handleSamplePress = (name: string) => {
    setReverseInput(name);
    setInspectedName(name);
  };

  const handleInspect = () => {
    const trimmed = reverseInput.trim();
    setInspectedName(trimmed.length > 0 ? trimmed : null);
  };

  const handleEnable = () => {
    actions.enable();
    logInfo('AgentSurface', 'NameShaping manually enabled from Viz debug panel');
  };

  const handleDisable = () => {
    actions.disable();
    logInfo('AgentSurface', 'NameShaping manually disabled from Viz debug panel');
  };

  const handleClear = () => {
    actions.clear();
    logInfo('AgentSurface', 'NameShaping cleared from Viz debug panel');
  };

  const handleAppendSelector = (selector: NameShapingSelector) => {
    actions.appendEmittedToken({
      selector,
      timestamp: Date.now(),
    });
    logInfo('AgentSurface', 'NameShaping appended selector from Viz debug panel', {
      selector,
    });
  };

  const handleAppendBreak = () => {
    actions.commitBreak();
    logInfo('AgentSurface', 'NameShaping appended BREAK from Viz debug panel');
  };

  const handleCommit = () => {
    actions.commitResolution();
    logInfo('AgentSurface', 'NameShaping resolution committed from Viz debug panel', {
      normalizedSignature: [...state.normalizedSignature],
    });
  };

  const handleSelectCandidate = (index: number) => {
    const candidate = state.resolverCandidates[index] ?? null;
    actions.setSelectedCandidate(candidate);
    logInfo('AgentSurface', 'NameShaping candidate selected from Viz debug panel', {
      cardId: candidate?.cardId,
      displayName: candidate?.displayName,
      score: candidate?.score,
    });
  };

  const handleSelectTopCandidate = () => {
    handleSelectCandidate(0);
  };

  return (
    <View style={styles.wrap}>
      <SectionTitle theme={theme} title="Controls" />
      <View style={styles.buttonRow}>
        <Button label="Enable" onPress={handleEnable} surface="debug" tone="success" />
        <Button label="Disable" onPress={handleDisable} surface="debug" tone="danger" />
        <Button label="Clear" onPress={handleClear} surface="debug" tone="muted" />
      </View>
      <View style={styles.buttonRow}>
        {SELECTOR_ORDER.filter((selector) => selector !== 'BREAK').map((selector) => (
          <Pressable
            key={selector}
            style={[styles.btn, styles.btnSelector]}
            onPress={() => handleAppendSelector(selector)}
          >
            <Text style={styles.btnText}>{selector}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.buttonRow}>
        <Button
          label="Append BREAK"
          onPress={handleAppendBreak}
          surface="debug"
          tone="accent"
        />
        <Button
          label="Commit"
          onPress={handleCommit}
          disabled={state.normalizedSignature.length === 0}
          surface="debug"
          tone="success"
        />
        <Button
          label="Select top"
          onPress={handleSelectTopCandidate}
          disabled={state.resolverCandidates.length === 0}
          surface="debug"
          tone="warning"
        />
      </View>
      <Pressable
        style={styles.pipelineToggle}
        onPress={() => setShowPipeline((prev) => !prev)}
      >
        <Text style={[styles.pipelineToggleText, { color: theme.textMuted }]}>
          {showPipeline ? '[x]' : '[ ]'} Show pipeline
        </Text>
      </Pressable>

      {showPipeline && (
        <>
          <SectionTitle theme={theme} title="Pipeline" />
          <Row
            theme={theme}
            label="NameShaping"
            value={state.enabled ? 'enabled' : 'disabled'}
          />
          <SectionTitle theme={theme} title="Selector legend" />
          {SELECTOR_ORDER.map((sel) => {
            const meta = SELECTOR_METADATA[sel];
            return (
              <Text
                key={sel}
                style={[styles.legendRow, { color: theme.textMuted }]}
                numberOfLines={2}
              >
                <Text style={[styles.legendLabel, { color: theme.text }]}>{sel}</Text>
                {' — '}
                {meta.displayLabel}: {meta.debugDescription}
              </Text>
            );
          })}
          <Row
            theme={theme}
            label="Active selector"
            value={state.activeSelector ?? undefined}
          />
          <Row
            theme={theme}
            label="Raw emitted sequence"
            value={
              state.rawEmittedSequence.length === 0
                ? '—'
                : state.rawEmittedSequence.map((t) => t.selector).join(', ')
            }
          />
          <Row
            theme={theme}
            label="Normalized signature"
            value={formatSignature(state.normalizedSignature)}
          />
          <Row
            theme={theme}
            label="Committed signature"
            value={formatSignature(state.committedSignature)}
            muted={state.committedSignature.length === 0}
          />
          <SectionTitle theme={theme} title="Resolver candidates" />
          {state.resolverCandidates.length === 0 ? (
            <Text style={[styles.placeholder, { color: theme.textMuted }]}>
              {state.committedSignature.length === 0
                ? 'No candidates yet. Commit the current signature to resolve.'
                : 'No candidates found for the committed signature.'}
            </Text>
          ) : (
            state.resolverCandidates.map((c, i) => (
              <Pressable
                key={`${c.cardId}-${i}`}
                style={[
                  styles.candidateChip,
                  { borderColor: theme.textMuted },
                  state.selectedCandidate?.cardId === c.cardId &&
                    styles.candidateChipSelected,
                ]}
                onPress={() => handleSelectCandidate(i)}
              >
                <Text
                  style={[styles.candidateRow, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {c.displayName} (score: {c.score})
                  {c.matchReason != null ? ` — ${c.matchReason}` : ''}
                </Text>
              </Pressable>
            ))
          )}
          <Row
            theme={theme}
            label="Selected candidate"
            value={
              state.selectedCandidate
                ? `${state.selectedCandidate.displayName} (${state.selectedCandidate.cardId})`
                : undefined
            }
          />
        </>
      )}

      <SectionTitle theme={theme} title="Reverse inspection (card name → signature)" />
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Purely buildCardNameSignature; no async lookup, no resolver.
      </Text>
      <TextInput
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.textMuted },
        ]}
        placeholder="Card name"
        placeholderTextColor={theme.textMuted}
        value={reverseInput}
        onChangeText={setReverseInput}
        onSubmitEditing={handleInspect}
        returnKeyType="done"
      />
      <View style={styles.sampleRow}>
        {SAMPLE_CARD_NAMES.map((name) => (
          <Pressable
            key={name}
            style={[styles.sampleChip, { borderColor: theme.textMuted }]}
            onPress={() => handleSamplePress(name)}
          >
            <Text style={[styles.sampleChipText, { color: theme.textMuted }]}>
              {name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Button label="Inspect" onPress={handleInspect} surface="debug" tone="default" />
      {reverseResult && (
        <>
          <Row theme={theme} label="normalized" value={reverseResult.normalizedName} />
          <Row theme={theme} label="base name" value={reverseResult.baseName} />
          <Row
            theme={theme}
            label="full name signature"
            value={formatSignature(reverseResult.fullNameSignature)}
          />
          <Row
            theme={theme}
            label="base name signature"
            value={formatSignature(reverseResult.baseNameSignature)}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fontMono,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  row: {
    fontSize: 12,
    fontFamily: fontMono,
    lineHeight: 18,
    marginBottom: 2,
  },
  label: {},
  value: {},
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  btn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  btnSelector: { backgroundColor: '#30363d' },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontSize: 12, fontFamily: fontMono, fontWeight: '600' },
  pipelineToggle: { paddingVertical: 4, marginBottom: 4 },
  pipelineToggleText: { fontSize: 12, fontFamily: fontMono },
  legendRow: { fontSize: 11, fontFamily: fontMono, lineHeight: 14, marginBottom: 2 },
  legendLabel: {},
  placeholder: { fontSize: 12, fontFamily: fontMono, marginBottom: 4 },
  candidateChip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  candidateChipSelected: {
    backgroundColor: 'rgba(31, 111, 235, 0.18)',
  },
  candidateRow: { fontSize: 12, fontFamily: fontMono, lineHeight: 16, marginBottom: 2 },
  hint: { fontSize: 11, fontFamily: fontMono, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    fontFamily: fontMono,
    marginBottom: 8,
  },
  sampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  sampleChip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  sampleChipText: { fontSize: 11, fontFamily: fontMono },
});
