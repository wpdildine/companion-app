/**
 * RevealChip: small disclosure chip for revealing a content block (e.g. Answer, Cards, Rules, Sources).
 * Overlay control / panel-adjacent context only. Presentation/composition only; fires onPress upward.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import {
  resolveControlColors,
  type ControlSurface,
  type ControlTone,
} from '../../theme/controlAppearance';

export type RevealChipProps = {
  label: string;
  onPress: () => void;
  surface?: ControlSurface;
  tone?: Extract<ControlTone, 'default' | 'muted' | 'accent'>;
};

export function RevealChip({
  label,
  onPress,
  surface = 'product',
  tone = 'default',
}: RevealChipProps) {
  const appearance = resolveControlColors(surface, tone);

  return (
    <Pressable
      style={[
        styles.chip,
        {
          borderColor: appearance.borderColor,
          backgroundColor: appearance.backgroundColor,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.label, { color: appearance.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
