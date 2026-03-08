/**
 * Haptic hooks for listening start/end. Called once per transition from AgentSurface.
 * Uses React Native Vibration; can be refined later (e.g. platform-specific patterns).
 */

import { Vibration } from 'react-native';

/** Trigger haptic when listening begins. Call once per transition. */
export function triggerListeningStartHaptic(): void {
  try {
    Vibration.vibrate(50);
  } catch {
    // ignore if Vibration unavailable
  }
}

/** Trigger haptic when listening ends / submit begins. Call once per transition. */
export function triggerListeningEndHaptic(): void {
  try {
    Vibration.vibrate(30);
  } catch {
    // ignore if Vibration unavailable
  }
}
