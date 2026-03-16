#!/usr/bin/env node
/**
 * Safe native artifact cleanup.
 * Removes Android build outputs only; iOS build folders are left intact because
 * React Native codegen may place generated files there that Pods depend on.
 *
 * For a fuller iOS clean, use Xcode Product -> Clean Build Folder or clear
 * DerivedData separately.
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

dirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    rmRecursive(dir);
    console.log('Removed:', path.relative(root, dir));
  }
});

console.log('Native build artifacts cleaned. Run ios/android again to rebuild.');
