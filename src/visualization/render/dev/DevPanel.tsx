/**
 * Developer controls: palette, easing, viz toggles. Writes only into runtime ref.
 * Gate: long-press on status header in AgentSurface sets devEnabled.
 */

import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
} from 'react-native';
import { PanelHeaderAction } from '../../../app/ui/components/controls';
import { useCallback, useEffect, useState } from 'react';
import {
  type VisualizationEngineRef,
  type VisualizationMode,
} from '../../runtime/runtimeTypes';
import { TARGET_ACTIVITY_BY_MODE } from '../../runtime/createDefaultRef';
import { updateVisualizationLayerDescriptors } from '../../runtime/applySceneUpdates';
import { triggerPulseAtCenter } from '../../runtime/triggerPulse';
import {
  VISUALIZATION_MOUNT_IDS,
  getDefaultLayerDescriptors,
  type VisualizationMountId,
} from '../../scene/layerDescriptor';

/** Minimal theme for DevPanel; injected by App (no theme import in nodeMap). */
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
const AXIS_LOCK_MODES: Array<'none' | 'x' | 'y'> = ['none', 'x', 'y'];
const DEFAULT_POST_FX = {
  enabled: true,
  vignette: 0.22,
  chromatic: 0.0002,
  grain: 0.04,
} as const;
const DEFAULT_MOTION_AXIS_DEBUG = {
  enabled: false,
  axisLockMode: 'none' as const,
  xGain: 1,
  yGain: 1,
  planeDeformGain: 1,
  planeBendGain: 1,
  planeWarpGain: 1,
  shardDriftGain: 1,
  glyphMotionGain: 1,
};

export function DevPanel({
  visualizationRef,
  onClose,
  theme,
  variant = 'overlay',
  showClose = true,
}: {
  visualizationRef: React.RefObject<VisualizationEngineRef | null>;
  onClose: () => void;
  theme: DevPanelTheme;
  variant?: 'overlay' | 'panel' | 'embed';
  showClose?: boolean;
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
      // RuntimeLoop owns cycle stepping; DevPanel only toggles flags.
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
      // RuntimeLoop owns cycle stepping; DevPanel only toggles flags.
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

  useEffect(() => {
    const viz = visualizationRef.current;
    if (!viz?.stateCycleOn && !viz?.canonicalCycleOn) return;
    const id = setInterval(() => setUiVersion(u => u + 1), 200);
    return () => clearInterval(id);
  }, [visualizationRef]);

  const v = visualizationRef.current;
  if (!v) return null;
  const layerDescriptors =
    v.scene?.layerDescriptors ?? getDefaultLayerDescriptors();
  const isLayerEnabled = (id: VisualizationMountId) =>
    layerDescriptors.find(d => d.id === id)?.enabled !== false;

  const wrapperStyle =
    variant === 'overlay' ? [StyleSheet.absoluteFill, styles.overlay] : [styles.inlineWrap];
  const panelStyle =
    variant === 'overlay' ? styles.panel : variant === 'embed' ? styles.panelEmbed : styles.panelInline;

  return (
    <View style={wrapperStyle} pointerEvents={variant === 'overlay' ? 'auto' : 'box-none'}>
      <View style={[panelStyle, { backgroundColor: bg }]} pointerEvents="auto">
        <View style={styles.header}>
          <Text style={[styles.title, { color: textColor }]}>DevPanel</Text>
          {showClose && (
            <PanelHeaderAction variant="close" onPress={onClose} surface="debug" />
          )}
        </View>
        <ScrollView style={styles.scroll}>
          <Text style={[styles.section, { color: muted }]}>Viz</Text>
          <Pressable
            onPress={() =>
              withViz(viz => {
                viz.vizIntensity =
                  viz.vizIntensity === 'off'
                    ? 'subtle'
                    : viz.vizIntensity === 'subtle'
                      ? 'full'
                      : 'off';
              })
            }
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
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Debug pulse loop</Text>
            <Pressable
              onPress={() =>
                withViz(viz => {
                  viz.debugPulseLoopOn = !viz.debugPulseLoopOn;
                  if (viz.debugPulseLoopOn) viz.debugLastPulseAtMs = 0;
                })
              }
            >
              <Text style={{ color: muted }}>
                {v.debugPulseLoopOn ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Pulse interval (ms)</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.debugPulseIntervalMs = Math.max(
                      120,
                      viz.debugPulseIntervalMs - 100,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.debugPulseIntervalMs}</Text>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.debugPulseIntervalMs = Math.min(
                      5000,
                      viz.debugPulseIntervalMs + 100,
                    );
                  })
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
            <Text style={{ color: textColor }}>Fire one pulse</Text>
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
            <Text style={{ color: textColor }}>Spine halftone accents</Text>
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
          <Text style={[styles.section, { color: muted }]}>Layers</Text>
          {VISUALIZATION_MOUNT_IDS.map(id => (
            <View key={id} style={styles.row}>
              <Text style={{ color: textColor }}>{id}</Text>
              <Pressable
                onPress={() => {
                  const nextEnabled = !isLayerEnabled(id);
                  updateVisualizationLayerDescriptors(visualizationRef, current => {
                    const source =
                      current.length > 0 ? current : getDefaultLayerDescriptors();
                    let found = false;
                    const next = source.map(d => {
                      if (d.id !== id) return d;
                      found = true;
                      return { ...d, enabled: nextEnabled };
                    });
                    if (found) return next;
                    return [...next, { id, enabled: nextEnabled }];
                  });
                  setUiVersion(u => u + 1);
                }}
              >
                <Text style={{ color: muted }}>
                  {isLayerEnabled(id) ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            </View>
          ))}

          <Text style={[styles.section, { color: muted }]}>State tests</Text>
          <View style={[styles.row, styles.currentStateRow]}>
            <Text style={{ color: muted }}>Current state</Text>
            <Text style={{ color: textColor, fontWeight: '600' }}>{v.currentMode}</Text>
          </View>
          <Pressable
            onPress={() => {
              withViz(viz => {
                // Reset dev mode ownership and set a known baseline.
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
            <Text style={{ color: textColor }}>Reset mode override to idle</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              withViz(viz => {
                viz.stateCycleOn = false;
                viz.canonicalCycleOn = false;
                viz.stateCycleTimerId = null;
                viz.canonicalCycleTimerId = null;
                viz.modePinActive = false;
                viz.modePin = null;
              });
              onClose();
            }}
            style={[styles.row, styles.button]}
          >
            <Text style={{ color: textColor }}>
              Restore app-driven mode (close Dev)
            </Text>
          </Pressable>
          <Text style={[styles.section, { color: muted }]}>Motion axis debug</Text>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Axis debug</Text>
            <Pressable
              onPress={() => {
                withViz(viz => {
                  viz.motionAxisDebug.enabled = !viz.motionAxisDebug.enabled;
                });
              }}
            >
              <Text style={{ color: muted }}>
                {v.motionAxisDebug.enabled ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Lock mode</Text>
            <Pressable
              onPress={() => {
                withViz(viz => {
                  const idx = AXIS_LOCK_MODES.indexOf(viz.motionAxisDebug.axisLockMode);
                  viz.motionAxisDebug.axisLockMode =
                    AXIS_LOCK_MODES[(idx + 1) % AXIS_LOCK_MODES.length]!;
                });
              }}
            >
              <Text style={{ color: muted }}>{v.motionAxisDebug.axisLockMode}</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>X gain</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.xGain = clamp(viz.motionAxisDebug.xGain - 0.1, 0, 3);
                  })
                }
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.motionAxisDebug.xGain.toFixed(1)}</Text>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.xGain = clamp(viz.motionAxisDebug.xGain + 0.1, 0, 3);
                  })
                }
              >
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Y gain</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.yGain = clamp(viz.motionAxisDebug.yGain - 0.1, 0, 3);
                  })
                }
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>{v.motionAxisDebug.yGain.toFixed(1)}</Text>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.yGain = clamp(viz.motionAxisDebug.yGain + 0.1, 0, 3);
                  })
                }
              >
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Plane deform gain</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.planeDeformGain = clamp(
                      viz.motionAxisDebug.planeDeformGain - 0.1,
                      0,
                      3,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>
                {v.motionAxisDebug.planeDeformGain.toFixed(1)}
              </Text>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.planeDeformGain = clamp(
                      viz.motionAxisDebug.planeDeformGain + 0.1,
                      0,
                      3,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Plane bend gain</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.planeBendGain = clamp(
                      viz.motionAxisDebug.planeBendGain - 0.1,
                      0,
                      3,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>
                {v.motionAxisDebug.planeBendGain.toFixed(1)}
              </Text>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.planeBendGain = clamp(
                      viz.motionAxisDebug.planeBendGain + 0.1,
                      0,
                      3,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Plane warp gain</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.planeWarpGain = clamp(
                      viz.motionAxisDebug.planeWarpGain - 0.1,
                      0,
                      3,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>
                {v.motionAxisDebug.planeWarpGain.toFixed(1)}
              </Text>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.planeWarpGain = clamp(
                      viz.motionAxisDebug.planeWarpGain + 0.1,
                      0,
                      3,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Shard drift gain</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.shardDriftGain = clamp(
                      viz.motionAxisDebug.shardDriftGain - 0.1,
                      0,
                      3,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>
                {v.motionAxisDebug.shardDriftGain.toFixed(1)}
              </Text>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.shardDriftGain = clamp(
                      viz.motionAxisDebug.shardDriftGain + 0.1,
                      0,
                      3,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={{ color: textColor }}>Glyph motion gain</Text>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.glyphMotionGain = clamp(
                      viz.motionAxisDebug.glyphMotionGain - 0.1,
                      0,
                      3,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> − </Text>
              </Pressable>
              <Text style={{ color: muted }}>
                {v.motionAxisDebug.glyphMotionGain.toFixed(1)}
              </Text>
              <Pressable
                onPress={() =>
                  withViz(viz => {
                    viz.motionAxisDebug.glyphMotionGain = clamp(
                      viz.motionAxisDebug.glyphMotionGain + 0.1,
                      0,
                      3,
                    );
                  })
                }
              >
                <Text style={{ color: textColor }}> + </Text>
              </Pressable>
            </View>
          </View>
          <Pressable
            onPress={() => {
              withViz(viz => {
                viz.motionAxisDebug.enabled = DEFAULT_MOTION_AXIS_DEBUG.enabled;
                viz.motionAxisDebug.axisLockMode =
                  DEFAULT_MOTION_AXIS_DEBUG.axisLockMode;
                viz.motionAxisDebug.xGain = DEFAULT_MOTION_AXIS_DEBUG.xGain;
                viz.motionAxisDebug.yGain = DEFAULT_MOTION_AXIS_DEBUG.yGain;
                viz.motionAxisDebug.planeDeformGain =
                  DEFAULT_MOTION_AXIS_DEBUG.planeDeformGain;
                viz.motionAxisDebug.planeBendGain =
                  DEFAULT_MOTION_AXIS_DEBUG.planeBendGain;
                viz.motionAxisDebug.planeWarpGain =
                  DEFAULT_MOTION_AXIS_DEBUG.planeWarpGain;
                viz.motionAxisDebug.shardDriftGain =
                  DEFAULT_MOTION_AXIS_DEBUG.shardDriftGain;
                viz.motionAxisDebug.glyphMotionGain =
                  DEFAULT_MOTION_AXIS_DEBUG.glyphMotionGain;
              });
            }}
            style={[styles.row, styles.button]}
          >
            <Text style={{ color: textColor }}>Reset Motion Debug Defaults</Text>
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
  inlineWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  panelInline: {
    width: '88%',
    maxWidth: 360,
    maxHeight: '65%',
    borderRadius: 12,
    padding: 16,
    zIndex: 1001,
    elevation: 21,
  },
  panelEmbed: {
    width: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    padding: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
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
