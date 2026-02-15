#!/usr/bin/env node
/**
 * Clean native build folders (Android only). For iOS we do not remove ios/build
 * because React Native codegen puts generated files there (e.g. RCTModuleProviders.mm)
 * that Pods depend on; removing ios/build causes "Build input file cannot be found".
 * For a full iOS clean, use Xcode: Product → Clean Build Folder (clears DerivedData).
 */

const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const dirs = [
  path.join(root, 'android', 'app', 'build'),
  path.join(root, 'android', 'build'),
];

function rmRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

dirs.forEach((dir) => {
  if (fs.existsSync(dir)) {
    rmRecursive(dir);
    console.log('Removed:', path.relative(root, dir));
  }
});

console.log('Build folders cleaned. Run ios/android again to rebuild.');
