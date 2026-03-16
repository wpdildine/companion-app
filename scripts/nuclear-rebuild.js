#!/usr/bin/env node
'use strict';

/**
 * End-to-end native rebuild: delete ios/ and android/, regenerate from RN CLI,
 * apply overrides, reinstall pods, and sync the small content pack.
 * Dependency reinstalls are intentionally separate; use pnpm run deps:reset first
 * when you want a true clean-folder rebuild.
 *
 * Run from repo root: pnpm run native:rebuild
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
  console.log('[nuclear-rebuild] 1/4 Wiping ios/ and android/...');
  if (fs.existsSync(IOS)) {
    fs.rmSync(IOS, { recursive: true, force: true });
    console.log('[nuclear-rebuild]   removed ios/');
  }
  if (fs.existsSync(ANDROID)) {
    fs.rmSync(ANDROID, { recursive: true, force: true });
    console.log('[nuclear-rebuild]   removed android/');
  }

  console.log('[nuclear-rebuild] 2/4 Regenerating native projects + overrides...');
  run('node scripts/regen-native.js');

  console.log('[nuclear-rebuild] 3/4 Pod install (iOS)...');
  run('pnpm run native:pods');

  console.log('[nuclear-rebuild] 4/4 Syncing content pack (small pack)...');
  run('pnpm run rag:pack');

  console.log('[nuclear-rebuild] Done. Run pnpm android or pnpm ios to build.');
}

main();
