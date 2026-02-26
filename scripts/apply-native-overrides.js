#!/usr/bin/env node
'use strict';

/**
 * Copies native customizations from scripts/native-overrides/ into ios/ and android/.
 * Run after regen-native (which recreates those dirs). Edit only files under
 * scripts/native-overrides/ — changes in ios/ or android/ will be lost when those dirs are deleted/regen'd.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OVERRIDES = path.join(ROOT, 'scripts', 'native-overrides');

const FILES = [
  ['ios/Podfile', 'ios/Podfile'],
  ['ios/CompanionApp/Info.plist', 'ios/CompanionApp/Info.plist'],
  ['ios/CompanionApp/CompanionApp.entitlements', 'ios/CompanionApp/CompanionApp.entitlements'],
  ['ios/CompanionApp/RagPackReaderModule.h', 'ios/CompanionApp/RagPackReaderModule.h'],
  ['ios/CompanionApp/RagPackReaderModule.m', 'ios/CompanionApp/RagPackReaderModule.m'],
  ['ios/CompanionApp.xcodeproj/project.pbxproj', 'ios/CompanionApp.xcodeproj/project.pbxproj'],
  ['android/settings.gradle', 'android/settings.gradle'],
  ['android/app/build.gradle', 'android/app/build.gradle'],
  ['android/app/src/main/AndroidManifest.xml', 'android/app/src/main/AndroidManifest.xml'],
  ['android/app/src/main/java/com/companionapp/MainApplication.kt', 'android/app/src/main/java/com/companionapp/MainApplication.kt'],
  ['android/app/src/main/java/com/companionapp/RagPackReaderModule.kt', 'android/app/src/main/java/com/companionapp/RagPackReaderModule.kt'],
  ['android/app/src/main/java/com/companionapp/RagPackReaderPackage.kt', 'android/app/src/main/java/com/companionapp/RagPackReaderPackage.kt'],
];

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

function main() {
  for (const [overrideRel] of FILES) {
    copyFileFromOverrides(overrideRel);
  }

  console.log('[apply-native-overrides] Re-applying Android voice patch...');
  execSync('node scripts/patch-react-native-voice-android.js', {
    cwd: ROOT,
    stdio: 'inherit',
  });

  console.log('[apply-native-overrides] Done.');
}

main();

