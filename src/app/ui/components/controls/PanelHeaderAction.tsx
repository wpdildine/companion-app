/**
 * PanelHeaderAction: low-weight panel chrome action (close, dismiss, collapse, secondary).
 * Presentation/composition only; fires onPress upward. For use in panel, overlay header, or debug context.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Platform } from 'react-native';
import {
  resolveControlColors,
  type ControlSurface,
  type ControlTone,
} from '../../theme/controlAppearance';

export type PanelHeaderActionVariant = 'close' | 'dismiss' | 'collapse' | 'action';

export type PanelHeaderActionProps = {
  variant: PanelHeaderActionVariant;
  onPress: () => void;
  /** Optional override; default derived from variant (e.g. "Close" for close). */
  label?: string;
  accessibilityLabel?: string;
  surface?: ControlSurface;
  tone?: Extract<ControlTone, 'default' | 'muted'>;
};

const DEFAULT_LABELS: Record<PanelHeaderActionVariant, string> = {
  close: 'Close',
  dismiss: 'Dismiss',
  collapse: 'Collapse',
  action: 'Action',
};

const fontMono = Platform.select({ ios: 'Menlo', android: 'monospace' });

export function PanelHeaderAction({
  variant,
  onPress,
  label,
  accessibilityLabel,
  surface = 'debug',
  tone = 'default',
}: PanelHeaderActionProps) {
  const displayLabel = label ?? DEFAULT_LABELS[variant];
  const appearance = resolveControlColors(surface, tone);

  return (
    <Pressable
      style={styles.wrapper}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? displayLabel}
    >
      <Text style={[styles.label, { color: appearance.ink }]}>{displayLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontFamily: fontMono,
    fontWeight: '600',
  },
});
