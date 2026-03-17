/**
 * Typography: font family tokens for the UI design system.
 *
 * Policy:
 * - body: long-form readable content, panel title/subtitle, explanatory text.
 * - mono: debug panels, telemetry, technical labels, structured metadata, chips/buttons for console feel.
 */

import { Platform } from 'react-native';

export const fontFamilies = {
  body: Platform.select({
    ios: 'RobotoMono-Regular',
    android: 'RobotoMono-Regular',
    default: 'monospace',
  }) as string,

  mono: Platform.select({
    ios: 'RobotoMono-Regular',
    android: 'RobotoMono-Regular',
    default: 'monospace',
  }) as string,

  monoMedium: Platform.select({
    ios: 'RobotoMono-Medium',
    android: 'RobotoMono-Medium',
    default: 'monospace',
  }) as string,

  monoBold: Platform.select({
    ios: 'RobotoMono-Bold',
    android: 'RobotoMono-Bold',
    default: 'monospace',
  }) as string,

  monoItalic: Platform.select({
    ios: 'RobotoMono-Italic',
    android: 'RobotoMono-Italic',
    default: 'monospace',
  }) as string,

  monoMediumItalic: Platform.select({
    ios: 'RobotoMono-MediumItalic',
    android: 'RobotoMono-MediumItalic',
    default: 'monospace',
  }) as string,

  monoBoldItalic: Platform.select({
    ios: 'RobotoMono-BoldItalic',
    android: 'RobotoMono-BoldItalic',
    default: 'monospace',
  }) as string,

  monoLight: Platform.select({
    ios: 'RobotoMono-Light',
    android: 'RobotoMono-Light',
    default: 'monospace',
  }) as string,

  monoLightItalic: Platform.select({
    ios: 'RobotoMono-LightItalic',
    android: 'RobotoMono-LightItalic',
    default: 'monospace',
  }) as string,

  monoThin: Platform.select({
    ios: 'RobotoMono-Thin',
    android: 'RobotoMono-Thin',
    default: 'monospace',
  }) as string,

  monoThinItalic: Platform.select({
    ios: 'RobotoMono-ThinItalic',
    android: 'RobotoMono-ThinItalic',
    default: 'monospace',
  }) as string,
};
