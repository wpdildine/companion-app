/**
 * Full-screen boot seam: matches native bootsplash until release is signaled.
 * @format
 */

import { Image, StyleSheet, View } from 'react-native';

const LOGO = require('../../assets/bootsplash/logo.png');

export type BootHandoffSurfaceProps = {
  onSafeToReleaseNative: () => void;
};

export default function BootHandoffSurface({
  onSafeToReleaseNative,
}: BootHandoffSurfaceProps) {
  return (
    <View
      style={styles.root}
      onLayout={() => {
        requestAnimationFrame(() => onSafeToReleaseNative());
      }}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a2332',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 100,
    height: 99,
  },
});
