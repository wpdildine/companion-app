/**
 * Button: stateless one-shot action only.
 * Do not use for toggles, selectors, or persistent state. Presentation/composition only; fires onPress upward.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Platform } from 'react-native';
import {
  resolveControlColors,
  type ControlSurface,
  type ControlTone,
} from '../../theme/controlAppearance';

export type ButtonVariant = 'default' | 'quiet';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  surface?: ControlSurface;
  tone?: ControlTone;
};

const fontMono = Platform.select({ ios: 'Menlo', android: 'monospace' });

export function Button({
  label,
  onPress,
  variant = 'default',
  disabled = false,
  surface = 'product',
  tone = 'default',
}: ButtonProps) {
  const isQuiet = variant === 'quiet';
  const appearance = resolveControlColors(surface, tone);

  return (
    <Pressable
      style={[
        styles.wrapper,
        isQuiet && styles.quiet,
        !isQuiet && {
          borderColor: appearance.borderColor,
          backgroundColor: appearance.backgroundColor,
        },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.label, { color: appearance.ink }, isQuiet && styles.quietLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  quiet: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 14,
    fontFamily: fontMono,
    fontWeight: '600',
  },
  quietLabel: {
    fontWeight: '500',
  },
});
