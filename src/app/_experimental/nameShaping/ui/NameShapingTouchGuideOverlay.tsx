/**
 * Experimental on-surface guide for Name Shaping selector regions.
 * Preserved as paused future-work UI; it should remain visual-only and must not
 * become the canonical touch owner.
 *
 * TODO(nameshaping-resume): Revisit Android rendering/perf before expanding this
 * guide further or making it part of the default product surface.
 */

import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  SELECTOR_METADATA,
  type NameShapingSelector,
} from '../foundation/nameShapingConstants';
import {
  NAME_SHAPING_OVERLAY_REGIONS,
  type NameShapingOverlayRegion,
} from '../layout/nameShapingTouchRegions';
import { getActiveBandVerticalEnvelope } from '../../../../visualization/interaction/activeBandEnvelope';
import { ndcRegionToScreenRect } from '../layout/nameShapingLayoutTransforms';

const SELECTOR_COLORS: Record<NameShapingSelector, string> = {
  BRIGHT: '#f59e0b',
  ROUND: '#ef4444',
  LIQUID: '#06b6d4',
  SOFT: '#22c55e',
  HARD: '#3b82f6',
  BREAK: '#a855f7',
};

const SELECTOR_TEXT_STYLES = StyleSheet.create({
  BRIGHT: { color: '#f59e0b' },
  ROUND: { color: '#ef4444' },
  LIQUID: { color: '#06b6d4' },
  SOFT: { color: '#22c55e' },
  HARD: { color: '#3b82f6' },
  BREAK: { color: '#a855f7' },
  voice: { color: '#0f172a' },
});

function getRegionLabel(region: NameShapingOverlayRegion): string {
  if (region.kind === 'voice') return 'VOICE';
  return SELECTOR_METADATA[region.selector!].displayLabel.toUpperCase();
}

function getRegionLetterGroups(region: NameShapingOverlayRegion): string {
  if (region.kind === 'voice') return 'hold to speak';
  const description = SELECTOR_METADATA[region.selector!].debugDescription;
  const marker = 'Typical letter groups:';
  const markerIndex = description.indexOf(marker);
  if (markerIndex < 0) return '';
  return description.slice(markerIndex + marker.length).trim();
}

function getRegionColor(region: NameShapingOverlayRegion): string {
  return region.kind === 'voice'
    ? '#f8fafc'
    : SELECTOR_COLORS[region.selector!];
}

function getRegionTextStyle(region: NameShapingOverlayRegion) {
  return region.kind === 'voice'
    ? SELECTOR_TEXT_STYLES.voice
    : SELECTOR_TEXT_STYLES[region.selector!];
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

  const verticalEnvelope = getActiveBandVerticalEnvelope(bandTopInsetPx, height);
  if (verticalEnvelope.activeHeightPx <= 0) return null;

  const envelope = {
    widthPx: width,
    activeHeightPx: verticalEnvelope.activeHeightPx,
    topOffsetPx: verticalEnvelope.topOffsetPx,
  };

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {NAME_SHAPING_OVERLAY_REGIONS.map((region, index) => {
        const rect = ndcRegionToScreenRect(region, envelope);
        const color = getRegionColor(region);
        const textStyle = getRegionTextStyle(region);

        return (
          <View
            key={`${region.kind}-${region.selector ?? 'voice'}-${index}`}
            style={[
              styles.regionWrap,
              {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              },
            ]}
          >
            <View style={styles.labelRow}>
              <View
                style={[
                  styles.sideChip,
                  styles.leftChip,
                  region.kind === 'voice'
                    ? styles.voiceChip
                    : styles.selectorChip,
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
                    styles.leftLabelText,
                    textStyle,
                  ]}
                >
                  {getRegionLabel(region)}
                </Text>
              </View>
              <View
                style={[
                  styles.sideChip,
                  styles.rightChip,
                  region.kind === 'voice'
                    ? styles.voiceChip
                    : styles.selectorChip,
                  {
                    borderColor: color,
                    shadowColor: color,
                  },
                ]}
              >
                <Text
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                  style={[
                    styles.rightLabelText,
                    textStyle,
                  ]}
                >
                  {getRegionLetterGroups(region)}
                </Text>
              </View>
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
    overflow: 'visible',
  },
  labelRow: {
    position: 'absolute',
    width: 300,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  sideChip: {
    width: 120,
    height: 48,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  leftChip: {
    alignItems: 'flex-start',
  },
  rightChip: {
    alignItems: 'flex-end',
  },
  selectorChip: {
    backgroundColor: 'rgba(15, 23, 42, 0.84)',
  },
  voiceChip: {
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
  },
  leftLabelText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'left',
    width: '100%',
  },
  rightLabelText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'right',
    width: '100%',
  },
});
