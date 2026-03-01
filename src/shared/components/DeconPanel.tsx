/**
 * Reusable modernist/decon panel shell.
 * Decon treatment is header-only and never affects body layout.
 */

import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type DeconPanelIntensity = 'off' | 'subtle' | 'full';
export type DeconPanelVariant = 'answer' | 'cards' | 'rules' | 'neutral' | 'warning';

export type DeconPanelProps = {
  title?: string;
  subtitle?: string;
  variant?: DeconPanelVariant;
  intensity?: DeconPanelIntensity;
  reduceMotion?: boolean;
  headerDecon?: boolean;
  onRect?: (rect: { x: number; y: number; w: number; h: number }) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  ink?: string;
  mutedInk?: string;
  panelFill?: string;
  panelStroke?: string;
  accentIntrusionA?: string;
  warn?: string;
};

const UNIT = 8;
const R1 = 10;
const H1 = 20;
const H1_LINE_HEIGHT = 26;
const H2 = 16;
const H2_LINE_HEIGHT = 22;
const META = 12;
const META_LINE_HEIGHT = 16;
const HEADER_GAP = 12;
const PANEL_PADDING = UNIT * 2;
const DEFAULT_PANEL_FILL = '#1f1f1f';
const DEFAULT_PANEL_STROKE = '#ffffff';
const DEFAULT_INK = '#f4f4f5';
const DEFAULT_MUTED = '#9a9aa2';
const DEFAULT_INTRUSION = '#6ea8ff';
const DEFAULT_WARN = '#f59e0b';

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba(')) {
    const parts = color
      .slice(5, -1)
      .split(',')
      .map(p => p.trim());
    if (parts.length === 4) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  const hex = color.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

export function DeconPanel({
  title,
  subtitle,
  variant = 'neutral',
  intensity = 'subtle',
  reduceMotion = false,
  headerDecon,
  onRect,
  children,
  style,
  ink = DEFAULT_INK,
  mutedInk = DEFAULT_MUTED,
  panelFill = DEFAULT_PANEL_FILL,
  panelStroke = DEFAULT_PANEL_STROKE,
  accentIntrusionA = DEFAULT_INTRUSION,
  warn = DEFAULT_WARN,
}: DeconPanelProps) {
  const shouldDeconHeader =
    headerDecon ?? (variant === 'cards' || variant === 'rules');
  const panelFillOpacity = intensity === 'full' ? 0.62 : 0.72;
  const borderOpacity = intensity === 'full' ? 0.28 : 0.2;
  const ghostOpacity = intensity === 'full' ? 0.1 : 0.08;
  const ghostOffsetX = intensity === 'full' ? 3 : 2;
  const ghostOffsetY = 1;

  const titleStyle = variant === 'answer' ? styles.titleH1 : styles.titleH2;

  const onLayout = (e: LayoutChangeEvent) => {
    if (!onRect) return;
    const { x, y, width, height } = e.nativeEvent.layout;
    onRect({ x, y, w: width, h: height });
  };

  const panelStyle = useMemo(
    () => ({
      backgroundColor: withAlpha(panelFill, panelFillOpacity),
      borderColor: withAlpha(panelStroke, borderOpacity),
    }),
    [panelFill, panelFillOpacity, panelStroke, borderOpacity],
  );

  return (
    <View style={[styles.panel, panelStyle, style]} onLayout={onLayout}>
      {variant === 'warning' ? (
        <View style={[styles.warningBar, { backgroundColor: withAlpha(warn, 0.6) }]} />
      ) : null}
      {(title || subtitle) && (
        <View style={styles.header}>
          {title ? (
            <View style={styles.titleWrap}>
              {shouldDeconHeader && intensity !== 'off' ? (
                <>
                  <Text
                    pointerEvents="none"
                    style={[
                      titleStyle,
                      styles.titleGhost,
                      {
                        color: withAlpha(accentIntrusionA, ghostOpacity),
                        transform: [
                          { translateX: reduceMotion ? 0 : ghostOffsetX },
                          { translateY: reduceMotion ? 0 : ghostOffsetY },
                        ],
                      },
                    ]}
                  >
                    {title}
                  </Text>
                  <View
                    pointerEvents="none"
                    style={[
                      styles.misregistrationLine,
                      { backgroundColor: withAlpha(accentIntrusionA, 0.15) },
                    ]}
                  />
                </>
              ) : null}
              <Text style={[titleStyle, { color: ink }]}>{title}</Text>
            </View>
          ) : null}
          {subtitle ? (
            <Text style={[styles.subtitle, { color: mutedInk }]}>{subtitle}</Text>
          ) : null}
        </View>
      )}
      <View>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: R1,
    overflow: 'hidden',
    padding: PANEL_PADDING,
  },
  warningBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  header: {
    marginBottom: HEADER_GAP,
  },
  titleWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  titleGhost: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 0,
  },
  misregistrationLine: {
    position: 'absolute',
    left: 2,
    top: 12,
    width: '52%',
    height: 1,
  },
  titleH1: {
    fontSize: H1,
    lineHeight: H1_LINE_HEIGHT,
    fontWeight: '700',
    zIndex: 1,
  },
  titleH2: {
    fontSize: H2,
    lineHeight: H2_LINE_HEIGHT,
    fontWeight: '600',
    zIndex: 1,
  },
  subtitle: {
    marginTop: 4,
    fontSize: META,
    lineHeight: META_LINE_HEIGHT,
    fontWeight: '500',
  },
});
