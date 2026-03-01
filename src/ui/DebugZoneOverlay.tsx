/**
 * Debug zone overlay: when debugShowZones is on, draws outlines for Cards/Rules (and answer) header rects.
 * Plan Phase 4.3: labels and state (inactive/armed/active). Default off.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NodeMapPanelRects } from '../nodeMap/types';

const ZONE_COLORS: Record<string, string> = {
  answer: '#22c55e',
  cards: '#3b82f6',
  rules: '#a855f7',
};

export type DebugZoneOverlayProps = {
  panelRects: NodeMapPanelRects;
  visible: boolean;
};

export function DebugZoneOverlay({ panelRects, visible }: DebugZoneOverlayProps) {
  if (!visible) return null;

  const keys = (Object.keys(panelRects) as Array<keyof NodeMapPanelRects>).filter(
    (k) => panelRects[k] && panelRects[k]!.w > 0 && panelRects[k]!.h > 0,
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {keys.map((key) => {
        const rect = panelRects[key]!;
        const color = ZONE_COLORS[key] ?? '#888';
        return (
          <View
            key={key}
            style={[
              styles.outline,
              {
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                borderColor: color,
              },
            ]}
          >
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {key}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  outline: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    marginLeft: 2,
  },
});
