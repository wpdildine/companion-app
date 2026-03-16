#!/usr/bin/env node
'use strict';

/**
 * Copies native customizations from scripts/native-overrides/ into ios/ and android/.
 * Run after regen-native (which recreates those dirs). Edit only files under
 * scripts/native-overrides/ - changes in ios/ or android/ will be lost when those dirs are deleted/regen'd.
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

  return [
    ['ios/Podfile', 'ios/Podfile'],
    [`ios/${iosTarget}/Info.plist`, `ios/${iosTarget}/Info.plist`],
    [`ios/${iosTarget}/${entitlementsFile}`, `ios/${iosTarget}/${entitlementsFile}`],
    [`ios/${iosTarget}/RagPackReaderModule.h`, `ios/${iosTarget}/RagPackReaderModule.h`],
    [`ios/${iosTarget}/RagPackReaderModule.m`, `ios/${iosTarget}/RagPackReaderModule.m`],
    [`ios/${iosTarget}.xcodeproj/project.pbxproj`, `ios/${iosTarget}.xcodeproj/project.pbxproj`],
    ['android/settings.gradle', 'android/settings.gradle'],
    ['android/app/build.gradle', 'android/app/build.gradle'],
    ['android/app/src/main/AndroidManifest.xml', 'android/app/src/main/AndroidManifest.xml'],
    [`${androidJavaRoot}/MainApplication.kt`, `${androidJavaRoot}/MainApplication.kt`],
    [`${androidJavaRoot}/RagPackReaderModule.kt`, `${androidJavaRoot}/RagPackReaderModule.kt`],
    [`${androidJavaRoot}/RagPackReaderPackage.kt`, `${androidJavaRoot}/RagPackReaderPackage.kt`],
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

function main() {
  for (const [overrideRel] of overrideFiles()) {
    copyFileFromOverrides(overrideRel);
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
