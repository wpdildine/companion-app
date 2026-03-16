#!/usr/bin/env node
'use strict';

/**
 * Generates Android mipmap and iOS AppIcon assets from assets/icons/atlas-icon.jpg.
 * Output goes to scripts/native-overrides/ so apply-native-overrides will copy them
 * into ios/ and android/ after regen-native.
 *
 * Requires macOS (uses sips). Run: node scripts/generate-app-icon.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAppIdentity } = require('./app-identity');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ICON = path.join(ROOT, 'assets', 'icons', 'atlas-icon.jpg');
const OVERRIDES = path.join(ROOT, 'scripts', 'native-overrides');

// Android mipmap densities and pixel sizes (launcher icon)
const ANDROID_SIZES = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

// iOS AppIcon: [filename, width in pixels]
const IOS_ICONS = [
  ['Icon-App-20x20@2x.png', 40],
  ['Icon-App-20x20@3x.png', 60],
  ['Icon-App-29x29@2x.png', 58],
  ['Icon-App-29x29@3x.png', 87],
  ['Icon-App-40x40@2x.png', 80],
  ['Icon-App-40x40@3x.png', 120],
  ['Icon-App-60x60@2x.png', 120],
  ['Icon-App-60x60@3x.png', 180],
  ['Icon-App-1024x1024@1x.png', 1024],
];

function sipsResize(srcPath, dstPath, size) {
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  execSync(
    `sips -s format png -z ${size} ${size} "${srcPath}" --out "${dstPath}"`,
    { stdio: 'inherit' }
  );
}

function main() {
  if (!fs.existsSync(SOURCE_ICON)) {
    console.error('[generate-app-icon] Missing source:', SOURCE_ICON);
    process.exit(1);
  }

  const identity = getAppIdentity();
  const androidRes = path.join(OVERRIDES, 'android', 'app', 'src', 'main', 'res');
  const iosAppIcon = path.join(OVERRIDES, 'ios', identity.iosTargetName, 'Images.xcassets', 'AppIcon.appiconset');

  console.log('[generate-app-icon] Source:', SOURCE_ICON);
  console.log('[generate-app-icon] Android output:', androidRes);
  console.log('[generate-app-icon] iOS output:', iosAppIcon);

  // Android: ic_launcher.png and ic_launcher_round.png per density
  for (const [folder, size] of ANDROID_SIZES) {
    const dir = path.join(androidRes, folder);
    const launcher = path.join(dir, 'ic_launcher.png');
    const round = path.join(dir, 'ic_launcher_round.png');
    sipsResize(SOURCE_ICON, launcher, size);
    sipsResize(SOURCE_ICON, round, size);
    console.log('[generate-app-icon] Android', folder, size + 'px');
  }

  // iOS: one PNG per size, then Contents.json
  for (const [filename, size] of IOS_ICONS) {
    const outPath = path.join(iosAppIcon, filename);
    sipsResize(SOURCE_ICON, outPath, size);
  }
  console.log('[generate-app-icon] iOS AppIcon images');

  const contentsJson = {
    images: [
      { filename: 'Icon-App-20x20@2x.png', idiom: 'iphone', scale: '2x', size: '20x20' },
      { filename: 'Icon-App-20x20@3x.png', idiom: 'iphone', scale: '3x', size: '20x20' },
      { filename: 'Icon-App-29x29@2x.png', idiom: 'iphone', scale: '2x', size: '29x29' },
      { filename: 'Icon-App-29x29@3x.png', idiom: 'iphone', scale: '3x', size: '29x29' },
      { filename: 'Icon-App-40x40@2x.png', idiom: 'iphone', scale: '2x', size: '40x40' },
      { filename: 'Icon-App-40x40@3x.png', idiom: 'iphone', scale: '3x', size: '40x40' },
      { filename: 'Icon-App-60x60@2x.png', idiom: 'iphone', scale: '2x', size: '60x60' },
      { filename: 'Icon-App-60x60@3x.png', idiom: 'iphone', scale: '3x', size: '60x60' },
      { filename: 'Icon-App-1024x1024@1x.png', idiom: 'ios-marketing', scale: '1x', size: '1024x1024' },
    ],
    info: { author: 'xcode', version: 1 },
  };

  fs.writeFileSync(
    path.join(iosAppIcon, 'Contents.json'),
    JSON.stringify(contentsJson, null, 2)
  );
  console.log('[generate-app-icon] iOS AppIcon Contents.json');

  const xcassetsRoot = path.join(iosAppIcon, '..');
  fs.writeFileSync(
    path.join(xcassetsRoot, 'Contents.json'),
    JSON.stringify({ info: { version: 1, author: 'xcode' } }, null, 2)
  );
  console.log('[generate-app-icon] iOS Images.xcassets root');

  console.log('[generate-app-icon] Done. Run node scripts/apply-native-overrides.js to copy into ios/ and android/.');
}

main();
