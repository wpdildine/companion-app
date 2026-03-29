/**
 * Piper TTS TurboModule spec for the New Architecture.
 * Use UnsafeObject for setOptions so codegen emits NSDictionary/ReadableMap (no custom struct).
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes';

export interface Spec extends TurboModule {
  /** Set options used by the next speak() call. UnsafeObject → NSDictionary/ReadableMap. */
  setOptions(options?: UnsafeObject | null): void;
  /** Stop in-flight synthesis/playback; in-flight speak() rejects with code E_CANCELLED. */
  stop(): void;
  /** Copy Piper model from app assets to files dir (Android). Resolves with path or rejects. */
  copyModelToFiles(): Promise<string>;
  speak(text: string): Promise<void>;
  isModelAvailable(): Promise<boolean>;
  getDebugInfo(): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('PiperTts');
