#!/usr/bin/env node
'use strict';

/**
 * After `react-native-bootsplash generate` (icon:splash), copies generator output from
 * `ios/` and `android/` into `scripts/native-overrides/` so the next `apply-native-overrides`
 * does not restore stale BootSplash assets.
 *
 * Run automatically from `pnpm run icon` between `icon:splash` and `icon:app`.
 */
const fs = require('fs');
const path = require('path');
const { getAppIdentity } = require('./app-identity');

const ROOT = path.resolve(__dirname, '..');
const OVERRIDES = path.join(ROOT, 'scripts', 'native-overrides');

function rmPath(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('[sync-bootsplash-to-overrides]', path.relative(ROOT, dst));
}

function copyDir(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  console.log('[sync-bootsplash-to-overrides]', path.relative(ROOT, dst));
}

function listNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

function main() {
  const identity = getAppIdentity();
  const iosTarget = identity.iosTargetName;
  const iosSrc = path.join(ROOT, 'ios', iosTarget);
  const iosDst = path.join(OVERRIDES, 'ios', iosTarget);
  const androidRes = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
  const androidResDst = path.join(OVERRIDES, 'android', 'app', 'src', 'main', 'res');

  if (!fs.existsSync(iosSrc)) {
    throw new Error(
      `[sync-bootsplash-to-overrides] Missing ${iosSrc}. Run pnpm run icon:splash first.`
    );
  }
  if (!fs.existsSync(androidRes)) {
    throw new Error(
      `[sync-bootsplash-to-overrides] Missing ${androidRes}. Run pnpm run icon:splash first.`
    );
  }

  copyFile(
    path.join(iosSrc, 'BootSplash.storyboard'),
    path.join(iosDst, 'BootSplash.storyboard')
  );

  const colorsSrc = path.join(iosSrc, 'Colors.xcassets');
  const colorsDst = path.join(iosDst, 'Colors.xcassets');
  for (const name of listNames(colorsDst)) {
    if (name.startsWith('BootSplashBackground-')) {
      rmPath(path.join(colorsDst, name));
    }
  }
  for (const name of listNames(colorsSrc)) {
    if (name.startsWith('BootSplashBackground-')) {
      copyDir(path.join(colorsSrc, name), path.join(colorsDst, name));
    }
  }

  const imgSrc = path.join(iosSrc, 'Images.xcassets');
  const imgDst = path.join(iosDst, 'Images.xcassets');
  for (const name of listNames(imgDst)) {
    if (name.startsWith('BootSplashLogo-') && name.endsWith('.imageset')) {
      rmPath(path.join(imgDst, name));
    }
  }
  for (const name of listNames(imgSrc)) {
    if (name.startsWith('BootSplashLogo-') && name.endsWith('.imageset')) {
      copyDir(path.join(imgSrc, name), path.join(imgDst, name));
    }
  }

  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  for (const d of densities) {
    const drawable = `drawable-${d}`;
    const src = path.join(androidRes, drawable, 'bootsplash_logo.png');
    const dst = path.join(androidResDst, drawable, 'bootsplash_logo.png');
    if (fs.existsSync(src)) {
      copyFile(src, dst);
    }
  }

  copyFile(
    path.join(androidRes, 'values', 'colors.xml'),
    path.join(androidResDst, 'values', 'colors.xml')
  );
  copyFile(
    path.join(androidRes, 'values', 'styles.xml'),
    path.join(androidResDst, 'values', 'styles.xml')
  );

  console.log('[sync-bootsplash-to-overrides] Done.');
}

main();
