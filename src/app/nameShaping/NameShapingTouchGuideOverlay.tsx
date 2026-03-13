import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  NAME_SHAPING_OVERLAY_REGIONS,
  type NameShapingOverlayRegion,
} from './nameShapingTouchRegions';
import { SELECTOR_METADATA, type NameShapingSelector } from './nameShapingConstants';

const SELECTOR_COLORS: Record<NameShapingSelector, string> = {
  BRIGHT: '#f59e0b',
  ROUND: '#ef4444',
  LIQUID: '#06b6d4',
  SOFT: '#22c55e',
  HARD: '#3b82f6',
  BREAK: '#a855f7',
};

function getRegionLabel(region: NameShapingOverlayRegion): string {
  if (region.kind === 'voice') return 'VOICE';
  return SELECTOR_METADATA[region.selector!].displayLabel.toUpperCase();
}

function getRegionColor(region: NameShapingOverlayRegion): string {
  return region.kind === 'voice' ? '#f8fafc' : SELECTOR_COLORS[region.selector!];
}

export type NameShapingTouchGuideOverlayProps = {
  visible: boolean;
  bandTopInsetPx: number;
};

export function NameShapingTouchGuideOverlay({
  visible,
  bandTopInsetPx,
}: NameShapingTouchGuideOverlayProps) {
  const { width, height } = useWindowDimensions();

  if (!visible || width <= 0 || height <= 0) return null;

  const activeHeight = Math.max(0, height - bandTopInsetPx);
  if (activeHeight <= 0) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {NAME_SHAPING_OVERLAY_REGIONS.map((region, index) => {
        const left = ((region.startNdcX + 1) * 0.5) * width;
        const right = ((region.endNdcX + 1) * 0.5) * width;
        const top =
          bandTopInsetPx + ((1 - region.endNdcY) * 0.5) * activeHeight;
        const bottom =
          bandTopInsetPx + ((1 - region.startNdcY) * 0.5) * activeHeight;
        const regionWidth = Math.max(0, right - left);
        const regionHeight = Math.max(0, bottom - top);
        const color = getRegionColor(region);

        return (
          <View
            key={`${region.kind}-${region.selector ?? 'voice'}-${index}`}
            style={[
              styles.regionWrap,
              {
                left,
                top,
                width: regionWidth,
                height: regionHeight,
              },
            ]}
          >
            <View
              style={[
                styles.labelChip,
                region.kind === 'voice' ? styles.voiceChip : styles.selectorChip,
                {
                  borderColor: color,
                  shadowColor: color,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={[
                  styles.labelText,
                  { color: region.kind === 'voice' ? '#0f172a' : color },
                ]}
              >
                {getRegionLabel(region)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 25,
    elevation: 25,
  },
  regionWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelChip: {
    minWidth: 76,
    maxWidth: '88%',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  selectorChip: {
    backgroundColor: 'rgba(15, 23, 42, 0.84)',
  },
  voiceChip: {
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
  },
  labelText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
});
