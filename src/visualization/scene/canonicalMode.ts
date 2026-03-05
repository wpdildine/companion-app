/**
 * Canonical mode for scene presets and planeCountByMode.
 * Same four modes as engine currentMode when mapped to canonical (idle/listening/processing/speaking).
 * Single source of truth to avoid import churn; used by formations, builders, and validation.
 */

export type CanonicalSceneMode =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking';
