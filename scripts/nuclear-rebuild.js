#!/usr/bin/env node
'use strict';

/**
 * Full nuclear wipe and rebuild: delete ios/ and android/, regenerate from RN CLI,
 * apply overrides, install deps, pod install, sync content pack.
 * Run from repo root: pnpm run nuclear-rebuild
 * Requires Node 22+ (nvm use 22).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const IOS = path.join(ROOT, 'ios');
const ANDROID = path.join(ROOT, 'android');

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function main() {
  console.log('[nuclear-rebuild] 1/5 Wiping ios/ and android/...');
  if (fs.existsSync(IOS)) {
    fs.rmSync(IOS, { recursive: true, force: true });
    console.log('[nuclear-rebuild]   removed ios/');
  }
  if (fs.existsSync(ANDROID)) {
    fs.rmSync(ANDROID, { recursive: true, force: true });
    console.log('[nuclear-rebuild]   removed android/');
  }

  console.log('[nuclear-rebuild] 2/5 Regenerating native projects + overrides...');
  run('node scripts/regen-native.js');

  console.log('[nuclear-rebuild] 3/5 pnpm install...');
  run('pnpm install');

  console.log('[nuclear-rebuild] 4/5 Pod install (iOS)...');
  run('pnpm run pod-install');

  console.log('[nuclear-rebuild] 5/5 Syncing content pack (sync-pack-small)...');
  run('pnpm run sync-pack-small');

  console.log('[nuclear-rebuild] Done. Run pnpm android or pnpm ios to build.');
}

main();
