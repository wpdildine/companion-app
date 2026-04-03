/**
 * Full-screen boot seam: matches native bootsplash until release is signaled.
 * Staged presentation: idle → alive → ready; one pulse cycle before release (Cycle 3).
 * @format
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';

const LOGO = require('../../assets/bootsplash/logo.png');

export type BootHandoffSurfaceProps = {
  onSafeToReleaseNative: () => void;
};

export default function BootHandoffSurface({
  onSafeToReleaseNative,
}: BootHandoffSurfaceProps) {
  const [stage, setStage] = useState<'idle' | 'alive' | 'ready'>('idle');
  const didStartRef = useRef(false);

  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      opacity.stopAnimation();
      scale.stopAnimation();
    };
  }, []);

  return (
    <View
      style={styles.root}
      onLayout={() => {
        if (didStartRef.current) {
          return;
        }
        didStartRef.current = true;

        requestAnimationFrame(() => {
          setStage('alive');

          const pulse = Animated.sequence([
            Animated.parallel([
              Animated.timing(opacity, {
                toValue: 0.92,
                duration: 600,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(scale, {
                toValue: 1.02,
                duration: 600,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(opacity, {
                toValue: 1,
                duration: 600,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(scale, {
                toValue: 1,
                duration: 600,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
          ]);

          pulse.start(({ finished }) => {
            if (!finished) {
              return;
            }

            setStage('ready');

            opacity.setValue(1);
            scale.setValue(1);

            onSafeToReleaseNative();
          });
        });
      }}>
      <Animated.View
        style={[
          styles.logoWrap,
          stage === 'idle'
            ? undefined
            : { opacity, transform: [{ scale }] },
        ]}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>
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
  logoWrap: {
    width: 100,
    height: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 100,
    height: 99,
  },
});
