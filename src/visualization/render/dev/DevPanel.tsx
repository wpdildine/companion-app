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
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  type VisualizationEngineRef,
  type VisualizationMode,
} from '../../engine/types';
import { TARGET_ACTIVITY_BY_MODE } from '../../engine/createDefaultRef';
import { triggerPulseAtCenter } from '../../engine/triggerPulse';

/** Minimal theme for DevPanel; injected by App/DevScreen (no theme import in nodeMap). */
export type DevPanelTheme = {
  text: string;
  textMuted: string;
  background: string;
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const APP_STATES: VisualizationMode[] = [
  'idle',
  'listening',
  'processing',
  'speaking',
  'touched',
  'released',
];

/** Canonical modes only — for spine validation (Cycle canonical). Temporary: remove when done. */
const CANONICAL_MODES: VisualizationMode[] = ['idle', 'listening', 'processing', 'speaking'];
const DEFAULT_POST_FX = {
  enabled: true,
  vignette: 0.22,
  chromatic: 0.0002,
  grain: 0.04,
} as const;

export function DevPanel({
  visualizationRef,
  onClose,
  theme,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  onClose: () => void;
  theme: DevPanelTheme;
}) {
  const [, setUiVersion] = useState(0);

  const textColor = theme.text;
  const muted = theme.textMuted;
  const bg = theme.background;

  const withViz = useCallback(
    (fn: (viz: VisualizationEngineRef) => void) => {
      const viz = visualizationRef.current;
      if (!viz) return;
      fn(viz);
      // Dev panel values are ref-backed; force repaint so controls reflect changes immediately.
      setUiVersion(v => v + 1);
    },
    [visualizationRef],
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
  const togglePostFxEnabled = () => {
    withViz(viz => {
      viz.postFxEnabled = !viz.postFxEnabled;
    });
  };
  const applyState = useCallback(
    (
      state: VisualizationMode,
      options?: { pin?: boolean; preserveCycle?: boolean },
    ) => {
      const shouldPin = options?.pin ?? true;
      const preserveCycle = options?.preserveCycle ?? false;
      withViz(viz => {
        // Manual state apply should pin mode until user re-enables a cycle.
        // Cycle-owned applies must not disable cycle flags.
        if (!preserveCycle) {
          viz.stateCycleOn = false;
          viz.canonicalCycleOn = false;
          viz.stateCycleTimerId = null;
          viz.canonicalCycleTimerId = null;
        }
        viz.modePinActive = shouldPin;
        viz.modePin = shouldPin ? state : null;
        viz.currentMode = state;
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
        triggerPulseAtCenter(visualizationRef);
      }
    },
    [visualizationRef, withViz],
  );
  const toggleStateCycle = useCallback(() => {
    const viz = visualizationRef.current;
    if (!viz) return;
    viz.stateCycleOn = !viz.stateCycleOn;
    if (viz.stateCycleOn) {
      // EngineLoop owns cycle stepping; DevPanel only toggles flags.
      viz.canonicalCycleOn = false;
      viz.modePinActive = false;
      viz.modePin = null;
      applyState(APP_STATES[viz.stateCycleIdx % APP_STATES.length]!, {
        pin: false,
        preserveCycle: true,
      });
    }
    viz.stateCycleTimerId = null;
    viz.canonicalCycleTimerId = null;
    setUiVersion(u => u + 1);
  }, [visualizationRef, applyState]);

  const toggleCanonicalCycle = useCallback(() => {
    const viz = visualizationRef.current;
    if (!viz) return;
    viz.canonicalCycleOn = !viz.canonicalCycleOn;
    if (viz.canonicalCycleOn) {
      // EngineLoop owns cycle stepping; DevPanel only toggles flags.
      viz.stateCycleOn = false;
      viz.modePinActive = false;
      viz.modePin = null;
      applyState(CANONICAL_MODES[viz.canonicalCycleIdx % CANONICAL_MODES.length]!, {
        pin: false,
        preserveCycle: true,
      });
    }
    viz.stateCycleTimerId = null;
    viz.canonicalCycleTimerId = null;
    setUiVersion(u => u + 1);
  }, [visualizationRef, applyState]);

  const v = visualizationRef.current;
  if (!v) return null;

  useEffect(() => {
    if (!v.stateCycleOn && !v.canonicalCycleOn) return;
    const id = setInterval(() => setUiVersion(u => u + 1), 200);
    return () => clearInterval(id);
  }, [v.stateCycleOn, v.canonicalCycleOn]);

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
          <Text style={[styles.section, { color: muted }]}>Viz</Text>
          <Pressable
            onPress={() => {
              v.vizIntensity =
                v.vizIntensity === 'off'
                  ? 'subtle'
                  : v.vizIntensity === 'subtle'
                    ? 'full'
                    : 'off';
            }}
            style={styles.row}
          >
            <Text style={{ color: textColor }}>Viz intensity</Text>
            <Text style={{ color: muted }}>{v.vizIntensity ?? 'subtle'}</Text>
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
            onPress={() => triggerPulseAtCenter(visualizationRef)}
            style={[styles.row, styles.button]}
          >
            <Text style={{ color: textColor }}>Debug pulses</Text>
          </Pressable>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Touch zone meshes</Text>
            <Pressable
              onPress={() => {
                withViz(viz => {
                  viz.showTouchZones = !viz.showTouchZones;
                });
              }}
            >
              <Text style={{ color: muted }}>{v.showTouchZones ? 'ON' : 'OFF'}</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Spine halftone planes</Text>
            <Pressable
              onPress={() => {
                withViz(viz => {
                  viz.spineUseHalftonePlanes = !viz.spineUseHalftonePlanes;
                });
              }}
            >
              <Text style={{ color: muted }}>
                {v.spineUseHalftonePlanes ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.section, { color: muted }]}>State tests</Text>
          <View style={[styles.row, styles.currentStateRow]}>
            <Text style={{ color: muted }}>Current state</Text>
            <Text style={{ color: textColor, fontWeight: '600' }}>{v.currentMode}</Text>
          </View>
          <Pressable
            onPress={() => {
              withViz(viz => {
                // Restore default app-driven mode behavior.
                viz.stateCycleOn = false;
                viz.canonicalCycleOn = false;
                viz.stateCycleTimerId = null;
                viz.canonicalCycleTimerId = null;
                viz.modePinActive = false;
                viz.modePin = null;
                viz.currentMode = 'idle';
                viz.targetActivity = TARGET_ACTIVITY_BY_MODE.idle;
                viz.touchActive = false;
                viz.touchWorld = null;
              });
            }}
            style={[styles.row, styles.button]}
          >
            <Text style={{ color: textColor }}>Reset to default mode behavior</Text>
          </Pressable>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Cycle all states</Text>
            <Pressable onPress={toggleStateCycle}>
              <Text style={{ color: muted }}>{v.stateCycleOn ? 'ON' : 'OFF'}</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Cycle canonical (spine)</Text>
            <Pressable onPress={toggleCanonicalCycle}>
              <Text style={{ color: muted }}>{v.canonicalCycleOn ? 'ON' : 'OFF'}</Text>
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
            <Text style={{ color: textColor }}>Post FX</Text>
            <Pressable onPress={togglePostFxEnabled}>
              <Text style={{ color: muted }}>
                {v.postFxEnabled ? 'ON' : 'OFF'} (tap to toggle — OFF = raw scene)
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              withViz(viz => {
                viz.postFxEnabled = DEFAULT_POST_FX.enabled;
                viz.postFxVignette = DEFAULT_POST_FX.vignette;
                viz.postFxChromatic = DEFAULT_POST_FX.chromatic;
                viz.postFxGrain = DEFAULT_POST_FX.grain;
              });
            }}
            style={[styles.row, styles.button]}
          >
            <Text style={{ color: textColor }}>Reset Post FX Defaults</Text>
          </Pressable>
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
  currentStateRow: {
    marginBottom: 4,
  },
  button: {
    marginTop: 8,
  },
});
