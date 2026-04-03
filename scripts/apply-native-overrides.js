#!/usr/bin/env node
'use strict';

/**
 * Copies native customizations from scripts/native-overrides/ into ios/ and android/.
 * Run after regen-native (which recreates those dirs). Edit only files under
 * scripts/native-overrides/ — durable truth lives there; direct edits under ios/ or android/
 * are provisional and are replaced on regen.
 *
 * Startup handoff (react-native-bootsplash): committed snapshots under native-overrides
 * (AppDelegate.mm, BootSplash.storyboard, Colors.xcassets, logo imageset, Android BootTheme
 * drawables, MainActivity). Re-run `pnpm run icon:splash` when changing the source logo, then
 * sync changed generator files into scripts/native-overrides (see repo boundary artifact).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAppIdentity } = require('./app-identity');

const ROOT = path.resolve(__dirname, '..');
const OVERRIDES = path.join(ROOT, 'scripts', 'native-overrides');

function overrideFiles() {
  const identity = getAppIdentity();
  const iosTarget = identity.iosTargetName;
  const entitlementsFile = `${iosTarget}.entitlements`;
  const androidJavaRoot = `android/app/src/main/java/${identity.androidPackagePath}`;
  const androidRes = 'android/app/src/main/res';

  return [
    ['ios/Podfile', 'ios/Podfile'],
    [`ios/${iosTarget}/Info.plist`, `ios/${iosTarget}/Info.plist`],
    [`ios/${iosTarget}/${entitlementsFile}`, `ios/${iosTarget}/${entitlementsFile}`],
    [`ios/${iosTarget}/RagPackReaderModule.h`, `ios/${iosTarget}/RagPackReaderModule.h`],
    [`ios/${iosTarget}/RagPackReaderModule.m`, `ios/${iosTarget}/RagPackReaderModule.m`],
    [`ios/${iosTarget}/AppDelegate.h`, `ios/${iosTarget}/AppDelegate.h`],
    [`ios/${iosTarget}/AppDelegate.mm`, `ios/${iosTarget}/AppDelegate.mm`],
    [`ios/${iosTarget}/main.m`, `ios/${iosTarget}/main.m`],
    [`ios/${iosTarget}/BootSplash.storyboard`, `ios/${iosTarget}/BootSplash.storyboard`],
    [`ios/${iosTarget}.xcodeproj/project.pbxproj`, `ios/${iosTarget}.xcodeproj/project.pbxproj`],
    ['android/settings.gradle', 'android/settings.gradle'],
    ['android/app/build.gradle', 'android/app/build.gradle'],
    ['android/app/src/main/AndroidManifest.xml', 'android/app/src/main/AndroidManifest.xml'],
    [`${androidJavaRoot}/MainActivity.kt`, `${androidJavaRoot}/MainActivity.kt`],
    [`${androidJavaRoot}/MainApplication.kt`, `${androidJavaRoot}/MainApplication.kt`],
    [`${androidJavaRoot}/RagPackReaderModule.kt`, `${androidJavaRoot}/RagPackReaderModule.kt`],
    [`${androidJavaRoot}/RagPackReaderPackage.kt`, `${androidJavaRoot}/RagPackReaderPackage.kt`],
    ['android/app/src/main/res/values/colors.xml', 'android/app/src/main/res/values/colors.xml'],
    [`${androidRes}/values/styles.xml`, `${androidRes}/values/styles.xml`],
    [`${androidRes}/drawable-mdpi/bootsplash_logo.png`, `${androidRes}/drawable-mdpi/bootsplash_logo.png`],
    [`${androidRes}/drawable-hdpi/bootsplash_logo.png`, `${androidRes}/drawable-hdpi/bootsplash_logo.png`],
    [`${androidRes}/drawable-xhdpi/bootsplash_logo.png`, `${androidRes}/drawable-xhdpi/bootsplash_logo.png`],
    [`${androidRes}/drawable-xxhdpi/bootsplash_logo.png`, `${androidRes}/drawable-xxhdpi/bootsplash_logo.png`],
    [`${androidRes}/drawable-xxxhdpi/bootsplash_logo.png`, `${androidRes}/drawable-xxxhdpi/bootsplash_logo.png`],
  ];
}

/** Directories to copy recursively (e.g. app icon assets). Override must exist. */
function overrideDirs() {
  const identity = getAppIdentity();
  return [
    'android/app/src/main/res/mipmap-mdpi',
    'android/app/src/main/res/mipmap-hdpi',
    'android/app/src/main/res/mipmap-xhdpi',
    'android/app/src/main/res/mipmap-xxhdpi',
    'android/app/src/main/res/mipmap-xxxhdpi',
    'android/app/src/main/res/mipmap-anydpi-v26',
    `ios/${identity.iosTargetName}/Images.xcassets/AppIcon.appiconset`,
    `ios/${identity.iosTargetName}/Colors.xcassets`,
    `ios/${identity.iosTargetName}/Images.xcassets/BootSplashLogo-68c383.imageset`,
  ];
}

function copyFileFromOverrides(rel) {
  const src = path.join(OVERRIDES, rel);
  const dst = path.join(ROOT, rel);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing override file: ${src}`);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('[apply-native-overrides] Copied', rel);
}

function copyDirFromOverrides(rel) {
  const src = path.join(OVERRIDES, rel);
  const dst = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return; // optional: icon dirs created by generate-app-icon.js
  if (!fs.statSync(src).isDirectory()) return;
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  console.log('[apply-native-overrides] Copied dir', rel);
}

function main() {
  for (const [overrideRel] of overrideFiles()) {
    copyFileFromOverrides(overrideRel);
  }
  for (const rel of overrideDirs()) {
    copyDirFromOverrides(rel);
  }

  console.log('[apply-native-overrides] Re-applying Android voice patch...');
  execSync('node scripts/patch-react-native-voice.js', {
    cwd: ROOT,
    stdio: 'inherit',
  });

  console.log('[apply-native-overrides] Re-applying Quick SQLite patch...');
  execSync('node scripts/patch-react-native-quick-sqlite.js', {
    cwd: ROOT,
    stdio: 'inherit',
  });

  console.log('[apply-native-overrides] Done.');
}

main();
