/**
 * Developer controls: palette, easing, viz toggles. Writes only into engine ref.
 * Gate: long-press on status header in VoiceScreen sets devEnabled.
 */

import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  useColorScheme,
} from 'react-native';
import type { VizEngineRef } from './types';
import { triggerPulseAtCenter } from './triggerPulse';

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export function DevPanel({
  vizRef,
  onClose,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
  onClose: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const v = vizRef.current;
  if (!v) return null;

  const textColor = isDark ? '#e5e5e5' : '#1a1a1a';
  const muted = isDark ? '#888' : '#666';
  const bg = isDark ? 'rgba(30,30,30,0.95)' : 'rgba(250,250,250,0.95)';

  const setPaletteId = (id: number) => {
    v.paletteId = Math.max(0, Math.floor(id));
  };
  const setHueShift = (x: number) => {
    v.hueShift = clamp(x, -0.1, 0.1);
  };
  const setSatBoost = (x: number) => {
    v.satBoost = clamp(x, 0.5, 1.5);
  };
  const setLumBoost = (x: number) => {
    v.lumBoost = clamp(x, 0.5, 1.5);
  };
  const setActivityLambda = (x: number) => {
    v.activityLambda = clamp(x, 0.5, 20);
  };
  const setLambdaUp = (x: number) => {
    v.lambdaUp = clamp(x, 0.5, 20);
  };
  const setLambdaDown = (x: number) => {
    v.lambdaDown = clamp(x, 0.5, 20);
  };
  const setStarCountMultiplier = (x: number) => {
    v.starCountMultiplier = clamp(x, 0.1, 3);
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <View style={[styles.panel, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: textColor }]}>DevPanel</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={{ color: textColor }}>Close</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll}>
          <Text style={[styles.section, { color: muted }]}>Viz toggles</Text>
          <Pressable
            onPress={() => (v.showViz = !v.showViz)}
            style={styles.row}
          >
            <Text style={{ color: textColor }}>Show viz</Text>
            <Text style={{ color: muted }}>{v.showViz ? 'ON' : 'OFF'}</Text>
          </Pressable>
          <Pressable
            onPress={() => (v.showConnections = !v.showConnections)}
            style={styles.row}
          >
            <Text style={{ color: textColor }}>Show connections</Text>
            <Text style={{ color: muted }}>
              {v.showConnections ? 'ON' : 'OFF'}
            </Text>
          </Pressable>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Star count mult.</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  setStarCountMultiplier(v.starCountMultiplier - 0.2)
                }
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>
                {v.starCountMultiplier.toFixed(1)}
              </Text>
              <Pressable
                onPress={() =>
                  setStarCountMultiplier(v.starCountMultiplier + 0.2)
                }
              >
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <Pressable
            onPress={() => triggerPulseAtCenter(vizRef)}
            style={[styles.row, styles.button]}
          >
            <Text style={{ color: textColor }}>Debug pulses</Text>
          </Pressable>

          <Text style={[styles.section, { color: muted }]}>Easing</Text>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>activityLambda</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() => setActivityLambda(v.activityLambda - 1)}
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>
                {v.activityLambda.toFixed(1)}
              </Text>
              <Pressable
                onPress={() => setActivityLambda(v.activityLambda + 1)}
              >
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>lambdaUp</Text>
            <View style={styles.row}>
              <Pressable onPress={() => setLambdaUp(v.lambdaUp - 1)}>
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.lambdaUp.toFixed(1)}</Text>
              <Pressable onPress={() => setLambdaUp(v.lambdaUp + 1)}>
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>lambdaDown</Text>
            <View style={styles.row}>
              <Pressable onPress={() => setLambdaDown(v.lambdaDown - 1)}>
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.lambdaDown.toFixed(1)}</Text>
              <Pressable onPress={() => setLambdaDown(v.lambdaDown + 1)}>
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>

          <Text style={[styles.section, { color: muted }]}>Palette</Text>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>paletteId</Text>
            <View style={styles.row}>
              <Pressable onPress={() => setPaletteId(v.paletteId - 1)}>
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.paletteId}</Text>
              <Pressable onPress={() => setPaletteId(v.paletteId + 1)}>
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>hueShift</Text>
            <View style={styles.row}>
              <Pressable onPress={() => setHueShift(v.hueShift - 0.02)}>
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.hueShift.toFixed(2)}</Text>
              <Pressable onPress={() => setHueShift(v.hueShift + 0.02)}>
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>satBoost</Text>
            <View style={styles.row}>
              <Pressable onPress={() => setSatBoost(v.satBoost - 0.1)}>
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.satBoost.toFixed(1)}</Text>
              <Pressable onPress={() => setSatBoost(v.satBoost + 0.1)}>
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>lumBoost</Text>
            <View style={styles.row}>
              <Pressable onPress={() => setLumBoost(v.lumBoost - 0.1)}>
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.lumBoost.toFixed(1)}</Text>
              <Pressable onPress={() => setLumBoost(v.lumBoost + 0.1)}>
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  panel: {
    width: '90%',
    maxWidth: 360,
    maxHeight: '80%',
    borderRadius: 12,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 8,
  },
  scroll: {
    maxHeight: 400,
  },
  section: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  button: {
    marginTop: 8,
  },
});
