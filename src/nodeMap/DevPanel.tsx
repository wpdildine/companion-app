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
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TARGET_ACTIVITY_BY_MODE,
  type VizEngineRef,
  type VizMode,
} from './types';
import { triggerPulseAtCenter } from './triggerPulse';

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const APP_STATES: VizMode[] = [
  'idle',
  'listening',
  'processing',
  'speaking',
  'touched',
  'released',
];

export function DevPanel({
  vizRef,
  onClose,
}: {
  vizRef: React.RefObject<VizEngineRef | null>;
  onClose: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const [, setUiVersion] = useState(0);
  const [stateCycleOn, setStateCycleOn] = useState(false);
  const stateCycleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateIdx = useRef(0);

  const textColor = isDark ? '#e5e5e5' : '#1a1a1a';
  const muted = isDark ? '#888' : '#666';
  const bg = isDark ? 'rgba(30,30,30,0.95)' : 'rgba(250,250,250,0.95)';

  const withViz = useCallback(
    (fn: (viz: VizEngineRef) => void) => {
      const viz = vizRef.current;
      if (!viz) return;
      fn(viz);
      // Dev panel values are ref-backed; force repaint so controls reflect changes immediately.
      setUiVersion(v => v + 1);
    },
    [vizRef],
  );

  const setPaletteId = (id: number) => {
    withViz(viz => {
      viz.paletteId = Math.max(0, Math.floor(id));
    });
  };
  const setHueShift = (x: number) => {
    withViz(viz => {
      viz.hueShift = clamp(x, -0.1, 0.1);
    });
  };
  const setSatBoost = (x: number) => {
    withViz(viz => {
      viz.satBoost = clamp(x, 0.5, 1.5);
    });
  };
  const setLumBoost = (x: number) => {
    withViz(viz => {
      viz.lumBoost = clamp(x, 0.5, 1.5);
    });
  };
  const setActivityLambda = (x: number) => {
    withViz(viz => {
      viz.activityLambda = clamp(x, 0.5, 20);
    });
  };
  const setLambdaUp = (x: number) => {
    withViz(viz => {
      viz.lambdaUp = clamp(x, 0.5, 20);
    });
  };
  const setLambdaDown = (x: number) => {
    withViz(viz => {
      viz.lambdaDown = clamp(x, 0.5, 20);
    });
  };
  const setStarCountMultiplier = (x: number) => {
    withViz(viz => {
      viz.starCountMultiplier = clamp(x, 0.1, 3);
    });
  };
  const setPostFxVignette = (x: number) => {
    withViz(viz => {
      viz.postFxVignette = clamp(x, 0, 1);
    });
  };
  const setPostFxChromatic = (x: number) => {
    withViz(viz => {
      viz.postFxChromatic = clamp(x, 0, 0.01);
    });
  };
  const setPostFxGrain = (x: number) => {
    withViz(viz => {
      viz.postFxGrain = clamp(x, 0, 0.2);
    });
  };
  const applyState = useCallback(
    (state: VizMode) => {
      withViz(viz => {
        viz.targetActivity = TARGET_ACTIVITY_BY_MODE[state];
        if (state === 'touched') {
          viz.touchActive = true;
          viz.touchWorld = [0, 0, 0];
        } else {
          viz.touchActive = false;
          viz.touchWorld = null;
        }
      });
      if (state === 'released') {
        // Released mode should show quick pulse then settle.
        triggerPulseAtCenter(vizRef);
      }
    },
    [vizRef, withViz],
  );
  const toggleStateCycle = () => {
    const next = !stateCycleOn;
    setStateCycleOn(next);
    setUiVersion(v => v + 1);
  };

  useEffect(() => {
    if (stateCycleOn) {
      stateCycleTimer.current = setInterval(() => {
        const mode = APP_STATES[stateIdx.current % APP_STATES.length]!;
        applyState(mode);
        stateIdx.current = (stateIdx.current + 1) % APP_STATES.length;
      }, 1300);
    } else if (stateCycleTimer.current) {
      clearInterval(stateCycleTimer.current);
      stateCycleTimer.current = null;
    }
    return () => {
      if (stateCycleTimer.current) {
        clearInterval(stateCycleTimer.current);
        stateCycleTimer.current = null;
      }
    };
  }, [stateCycleOn, applyState]);

  const v = vizRef.current;
  if (!v) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="auto">
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

          <Text style={[styles.section, { color: muted }]}>State tests</Text>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Cycle all states</Text>
            <Pressable onPress={toggleStateCycle}>
              <Text style={{ color: muted }}>{stateCycleOn ? 'ON' : 'OFF'}</Text>
            </Pressable>
          </View>
          {APP_STATES.map(state => (
            <Pressable
              key={state}
              onPress={() => applyState(state)}
              style={styles.row}
            >
              <Text style={{ color: textColor }}>Apply {state}</Text>
            </Pressable>
          ))}

          <Text style={[styles.section, { color: muted }]}>Post FX</Text>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Enable post FX</Text>
            <Text style={{ color: muted }}>{v.postFxEnabled ? 'ON' : 'OFF'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Vignette</Text>
            <View style={styles.row}>
              <Pressable onPress={() => setPostFxVignette(v.postFxVignette - 0.05)}>
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.postFxVignette.toFixed(2)}</Text>
              <Pressable onPress={() => setPostFxVignette(v.postFxVignette + 0.05)}>
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Chromatic</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() => setPostFxChromatic(v.postFxChromatic - 0.0005)}
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.postFxChromatic.toFixed(4)}</Text>
              <Pressable
                onPress={() => setPostFxChromatic(v.postFxChromatic + 0.0005)}
              >
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Grain</Text>
            <View style={styles.row}>
              <Pressable onPress={() => setPostFxGrain(v.postFxGrain - 0.01)}>
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.postFxGrain.toFixed(2)}</Text>
              <Pressable onPress={() => setPostFxGrain(v.postFxGrain + 0.01)}>
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>

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
    zIndex: 1000,
    elevation: 20,
  },
  panel: {
    width: '90%',
    maxWidth: 360,
    maxHeight: '80%',
    borderRadius: 12,
    padding: 16,
    zIndex: 1001,
    elevation: 21,
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
