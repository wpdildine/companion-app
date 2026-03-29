import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const fontMono = Platform.select({ ios: 'Menlo', android: 'monospace' });

const TEXT_PRIMARY = '#ffffff';
const TEXT_MUTED = '#8b949e';

export function DebugMenuSection({
  title,
  defaultExpanded = false,
  deemphasized = false,
  children,
}: {
  title: string;
  defaultExpanded?: boolean;
  deemphasized?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <View style={deemphasized ? styles.auxWrap : undefined}>
      <Pressable
        style={styles.header}
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
      >
        <Text style={styles.chevron}>{open ? '[-]' : '[+]'}</Text>
        <Text
          style={[
            styles.title,
            deemphasized && styles.titleAux,
          ]}
        >
          {title}
        </Text>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  auxWrap: { opacity: 0.92 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 6,
  },
  chevron: {
    width: 28,
    fontSize: 11,
    fontFamily: fontMono,
    color: TEXT_MUTED,
  },
  title: {
    fontSize: 12,
    fontFamily: fontMono,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    flex: 1,
  },
  titleAux: {
    color: TEXT_MUTED,
    fontSize: 11,
  },
  body: {
    paddingLeft: 4,
    paddingBottom: 4,
  },
});
