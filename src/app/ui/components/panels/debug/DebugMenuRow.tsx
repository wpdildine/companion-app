import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Platform } from 'react-native';

const fontMono = Platform.select({ ios: 'Menlo', android: 'monospace' });
const TEXT_PRIMARY = '#ffffff';
const TEXT_MUTED = '#8b949e';

export function DebugMenuRow({
  label,
  sublabel,
  onPress,
  right,
}: {
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right: React.ReactNode;
}) {
  const inner = (
    <View style={styles.rowInner}>
      <View style={styles.left}>
        <Text style={styles.label}>{label}</Text>
        {sublabel ? (
          <Text style={styles.sublabel} numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    minHeight: 28,
  },
  left: { flex: 1, marginRight: 8 },
  right: { alignItems: 'flex-end', justifyContent: 'center' },
  label: {
    fontSize: 12,
    fontFamily: fontMono,
    color: TEXT_MUTED,
  },
  sublabel: {
    fontSize: 10,
    fontFamily: fontMono,
    color: TEXT_MUTED,
    opacity: 0.75,
    marginTop: 2,
  },
  controlText: {
    fontSize: 12,
    fontFamily: fontMono,
    color: TEXT_PRIMARY,
    fontWeight: '600',
  },
});
