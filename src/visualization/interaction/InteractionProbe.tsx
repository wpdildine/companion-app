/**
 * Passive debug overlay for interaction band. Receives state from InteractionBand;
 * does not capture touches. Only for diagnostics when debugInteraction is true.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type InteractionProbeDebugState = {
  ndc: [number, number] | null;
  zone: 'rules' | 'cards' | null;
  eligible: boolean;
  touchActive: boolean;
};

export type InteractionProbeProps = {
  /** When provided, overlay shows readout. Band passes this when debugInteraction is true. */
  debugState: InteractionProbeDebugState | null;
  /** Layout width/height for display (optional). */
  layoutW?: number;
  layoutH?: number;
};

export function InteractionProbe({
  debugState,
  layoutW = 0,
  layoutH = 0,
}: InteractionProbeProps) {
  if (!debugState || !debugState.touchActive) {
    return <View style={styles.container} pointerEvents="none" />;
  }

  const { ndc, zone, eligible } = debugState;
  const ndcStr =
    ndc != null
      ? `${ndc[0].toFixed(2)}, ${ndc[1].toFixed(2)}`
      : '—';
  const zoneStr = zone ?? 'center';

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.readout}>
        <Text style={styles.debugText}>
          NDC: {ndcStr}{'\n'}
          Zone: {zoneStr}{'\n'}
          Eligible: {eligible ? 'yes' : 'no'}
          {layoutW > 0 && layoutH > 0 ? `\n${layoutW}×${layoutH}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 255, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  readout: {
    position: 'absolute',
    top: 8,
    left: 8,
    padding: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
  },
  debugText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
