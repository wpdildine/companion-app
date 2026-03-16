/**
 * Shared transient effect definition types. Modulation shape is authored here
 * and interpreted in render layers (not runtime/runtime).
 */

export interface TransientModulation {
  hueShift: number;
  intensity: number;
  agitation: number;
  opacityBias: number;
  centerPulseOnly?: boolean;
}

/** Peak modulation and decay for one transient effect. Authored in shared definitions only. */
export interface TransientEffectDefinition {
  decayMs: number;
  modulation: TransientModulation;
}

export const ZERO_MODULATION: TransientModulation = {
  hueShift: 0,
  intensity: 0,
  agitation: 0,
  opacityBias: 0,
};
