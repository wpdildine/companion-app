/**
 * Pipeline Telemetry Debug Panel: read-only HUD showing live request telemetry
 * (voice → RAG → generation → TTS). Single vertical list, label: value format.
 * Updates in realtime from requestDebugStore state.
 */

import React, { useMemo } from 'react';
import { Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RequestDebugState, RequestDebugEvent } from '../../../../agent/requestDebugTypes';
import { PanelHeaderAction } from '../../controls';

const PANEL_WIDTH = 360;
const TRUNCATE_PREVIEW = 200;

const BG = 'rgba(15,17,21,0.9)';
const BORDER = '#2a2f38';
const TEXT_PRIMARY = '#ffffff';
const TEXT_MUTED = '#8b949e';
const STATUS_ACTIVE = '#58a6ff';
const STATUS_COMPLETED = '#3fb950';
const STATUS_FAILED = '#f85149';
const STATUS_CANCELED_SUPERSEDED = '#8b949e'; // reserved; not emitted in current chunk
const TIMELINE_MUTED = 'rgba(139,148,158,0.9)';

const fontMono = Platform.select({ ios: 'Menlo', android: 'monospace' });

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

function formatTs(ts: number | null | undefined): string {
  if (ts == null) return '—';
  return String(ts);
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string | number | null | undefined;
  muted?: boolean;
}) {
  const v = value == null ? '—' : String(value);
  return (
    <Text style={[styles.row, muted && styles.rowMuted]} numberOfLines={1}>
      <Text style={styles.label}>{label}: </Text>
      <Text style={styles.value}>{v}</Text>
    </Text>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export type PipelineTelemetryPanelProps = {
  state: RequestDebugState;
  onClose: () => void;
  maxHeight?: number;
  maxWidth?: number;
};

export function PipelineTelemetryPanel({ state, onClose, maxHeight, maxWidth }: PipelineTelemetryPanelProps) {
  const snapshot = useMemo(() => {
    if (state.activeRequestId != null) {
      const s = state.snapshotsById.get(state.activeRequestId);
      if (s) return s;
    }
    if (state.recentRequestIds.length > 0) {
      const id = state.recentRequestIds[state.recentRequestIds.length - 1];
      return state.snapshotsById.get(id) ?? null;
    }
    return null;
  }, [state.activeRequestId, state.recentRequestIds, state.snapshotsById]);

  const requestId = snapshot?.requestId ?? null;
  const timelineEvents = useMemo(() => {
    if (requestId == null) return [];
    const list = state.events.filter((e: RequestDebugEvent) => e.requestId === requestId);
    return list.slice(); // chronological
  }, [state.events, requestId]);

  const t0 = timelineEvents.length > 0 ? timelineEvents[0].timestamp : 0;

  if (snapshot == null) {
    return (
      <View style={styles.panel}>
        <PanelHeaderAction variant="close" onPress={onClose} surface="debug" />
        <Text style={styles.placeholder}>No request data. Start a request to see telemetry.</Text>
      </View>
    );
  }

  const d = snapshot.durations;
  const rs = snapshot.ragTelemetry?.retrievalSummary;
  const pa = snapshot.ragTelemetry?.promptAssembly;
  const model = snapshot.modelInfo ?? snapshot.ragTelemetry?.generationRequest;
  const statusColor =
    snapshot.status === 'active'
      ? STATUS_ACTIVE
      : snapshot.status === 'completed'
        ? STATUS_COMPLETED
        : snapshot.status === 'canceled' || snapshot.status === 'superseded'
          ? STATUS_CANCELED_SUPERSEDED
          : STATUS_FAILED;

  const window = Dimensions.get('window');
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(240, (maxWidth ?? window.width) - 24));
  const panelMaxHeight = Math.max(240, (maxHeight ?? window.height) - 24);

  const scrollMaxHeight = Math.max(160, panelMaxHeight - 96);

  return (
    <View style={[styles.panel, { width: panelWidth, maxHeight: panelMaxHeight }]}>
      <PanelHeaderAction variant="close" onPress={onClose} surface="debug" />
      <Text style={styles.mainTitle}>Pipeline Telemetry</Text>
      <ScrollView
        style={[styles.scroll, { maxHeight: scrollMaxHeight }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <SectionTitle title="Request" />
        <Row label="requestId" value={snapshot.requestId} />
        <Row label="lifecycle" value={snapshot.lifecycle || undefined} />
        <Text style={[styles.row, { color: statusColor }]}>
          <Text style={styles.label}>request outcome: </Text>
          <Text style={styles.value}>{snapshot.status}</Text>
        </Text>
        {snapshot.platform != null && (
          <Row label="platform" value={snapshot.platform} muted />
        )}
        {snapshot.status === 'active' && snapshot.processingSubstate != null && (
          <Row label="processingSubstate" value={snapshot.processingSubstate} />
        )}
        <Row label="acceptedTranscript" value={truncate(snapshot.acceptedTranscript, TRUNCATE_PREVIEW)} muted />
        <Row label="normalizedTranscript" value={truncate(snapshot.normalizedTranscript, TRUNCATE_PREVIEW)} muted />
        {snapshot.failureReason != null && (
          <Text style={[styles.row, { color: STATUS_FAILED }]}>
            <Text style={styles.label}>failureReason: </Text>
            <Text style={styles.value}>{truncate(snapshot.failureReason, TRUNCATE_PREVIEW)}</Text>
          </Text>
        )}
        {snapshot.lastRecoverableFailureReason != null && (
          <Row label="lastRecoverableFailure" value={truncate(snapshot.lastRecoverableFailureReason, TRUNCATE_PREVIEW)} muted />
        )}

        <SectionTitle title="Retrieval" />
        <Row label="retrievalMode" value={rs?.retrievalMode} />
        <Row label="contextLength" value={rs?.contextLength} />
        <Row label="bundleId" value={rs?.bundleId} />
        <Row label="ruleSetId" value={rs?.ruleSetId} />
        {rs?.bundlePreview != null && (
          <Row label="bundlePreview" value={truncate(rs.bundlePreview, TRUNCATE_PREVIEW)} muted />
        )}
        {snapshot.packIdentity != null && (
          <>
            <Row label="packRoot" value={snapshot.packIdentity.packRoot} muted />
            <Row label="chatModelPath" value={snapshot.packIdentity.chatModelPath} muted />
          </>
        )}

        <SectionTitle title="Prompt" />
        <Row label="promptLength" value={pa?.promptLength ?? undefined} />
        <Row label="rulesCount" value={pa?.rulesCount} />
        <Row label="cardsCount" value={pa?.cardsCount} />
        <Row label="promptHash" value={pa?.promptHash ?? snapshot.promptHash} />
        {pa?.promptPreview != null && (
          <Row label="promptPreview" value={truncate(pa.promptPreview, TRUNCATE_PREVIEW)} muted />
        )}

        <SectionTitle title="Generation" />
        <Row label="modelPath" value={model?.modelPath} />
        <Row label="modelId" value={model?.modelId} />
        {snapshot.modelLoadCold != null && (
          <Row label="modelLoadCold" value={snapshot.modelLoadCold ? 'cold' : 'warm'} />
        )}
        <Row label="temperature" value={model?.temperature} />
        <Row label="topP" value={model?.topP} />
        <Row label="maxTokens" value={model?.maxTokens} />
        <Row label="generationStartedAt" value={formatTs(snapshot.generationStartedAt)} muted />
        <Row label="firstTokenAt" value={formatTs(snapshot.firstTokenAt)} muted />
        <Row label="generationEndedAt" value={formatTs(snapshot.generationEndedAt)} muted />
        {snapshot.partialStream && (
          <Row
            label="partialOutput"
            value={truncate(snapshot.partialStream, TRUNCATE_PREVIEW)}
            muted
          />
        )}
        {snapshot.finalSettledOutput != null && (
          <Row
            label="finalSettledOutput"
            value={truncate(snapshot.finalSettledOutput, TRUNCATE_PREVIEW)}
            muted
          />
        )}

        <SectionTitle title="Cards / Rules" />
        {snapshot.validationSummary != null ? (
          <>
            <Row label="cards" value={snapshot.validationSummary.cards.length} />
            <Row label="rules" value={snapshot.validationSummary.rules.length} />
            <Row label="cardHitRate" value={snapshot.validationSummary.stats.cardHitRate} muted />
            <Row label="ruleHitRate" value={snapshot.validationSummary.stats.ruleHitRate} muted />
            <Row label="unknownCardCount" value={snapshot.validationSummary.stats.unknownCardCount} muted />
            <Row label="invalidRuleCount" value={snapshot.validationSummary.stats.invalidRuleCount} muted />
          </>
        ) : (
          <Text style={[styles.row, styles.rowMuted]}>—</Text>
        )}

        <SectionTitle title="TTS" />
        <Row label="ttsStartedAt" value={formatTs(snapshot.ttsStartedAt)} muted />
        <Row label="ttsEndedAt" value={formatTs(snapshot.ttsEndedAt)} muted />

        <SectionTitle title="Performance" />
        <Row label="retrievalMs" value={d?.retrievalMs != null ? `${d.retrievalMs} ms` : undefined} />
        <Row label="contextPrepMs" value={d?.contextPrepMs != null ? `${d.contextPrepMs} ms` : undefined} />
        <Row label="modelLoadMs" value={d?.modelLoadMs != null ? `${d.modelLoadMs} ms` : undefined} />
        <Row label="generationMs" value={d?.generationMs != null ? `${d.generationMs} ms` : undefined} />
        <Row label="TTFT (from ask start)" value={d?.timeToFirstTokenMs != null ? `${d.timeToFirstTokenMs} ms` : undefined} />
        {d?.timeToFirstTokenFromInferenceMs != null && (
          <Row label="TTFT (from inference start)" value={`${d.timeToFirstTokenFromInferenceMs} ms`} />
        )}
        <Row label="streamingMs" value={d?.streamingMs != null ? `${d.streamingMs} ms` : undefined} />
        <Row label="validationMs" value={d?.validationMs != null ? `${d.validationMs} ms` : undefined} />
        <Row label="settlingMs" value={d?.settlingMs != null ? `${d.settlingMs} ms` : undefined} />
        <Row label="playbackMs" value={d?.ttsMs != null ? `${d.ttsMs} ms` : undefined} />
        <Row label="totalRequestMs" value={d?.totalRequestMs != null ? `${d.totalRequestMs} ms` : undefined} />

        <SectionTitle title="Boundaries" />
        <Text style={[styles.row, styles.rowMuted]}>response_settled = commit; request_complete = terminal</Text>

        <SectionTitle title="Timeline" />
        {timelineEvents.length === 0 ? (
          <Text style={[styles.timelineRow, styles.rowMuted]}>—</Text>
        ) : (
          timelineEvents.map((e: RequestDebugEvent) => {
            const delta = e.timestamp - t0;
            return (
              <Text key={e.eventSeq} style={styles.timelineRow}>
                +{delta}ms {e.type}
              </Text>
            );
          })
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
    color: TEXT_MUTED,
    fontSize: 15,
    fontFamily: fontMono,
    fontWeight: '700',
    marginBottom: 6,
  },
  placeholder: {
    color: TEXT_MUTED,
    fontSize: 12,
    fontFamily: fontMono,
    marginTop: 8,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 16 },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: fontMono,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  row: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontFamily: fontMono,
    lineHeight: 18,
    marginBottom: 2,
  },
  rowMuted: { color: TEXT_MUTED },
  label: { color: TEXT_MUTED },
  value: { color: TEXT_PRIMARY },
  timelineRow: {
    color: TIMELINE_MUTED,
    fontSize: 11,
    fontFamily: fontMono,
    lineHeight: 16,
    marginBottom: 1,
  },
});
