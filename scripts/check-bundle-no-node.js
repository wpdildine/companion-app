#!/usr/bin/env node
'use strict';
/**
 * Fails if the built RN bundle contains Node-only module markers.
 * Run after building the bundle (same command as release: e.g. react-native bundle).
 * Store artifact paths in this script so CI greps real files.
 *
 * Usage:
 *   node scripts/check-bundle-no-node.js [path-to-bundle-file]
 *   node scripts/check-bundle-no-node.js
 *
 * With no path: checks common artifact locations (main.jsbundle, index.android.bundle).
 * With path: checks that file only. Exits 1 if any Node marker is found.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const NODE_MARKERS = [
  'require("fs")',
  'require("path")',
  'require("better-sqlite3")',
  'require("node:',
  'from "fs"',
  'from "path"',
  'from "better-sqlite3"',
  'from "node:',
  'process.binding',
  '.require("fs")',
  '.require("path")',
];

const DEFAULT_ARTIFACT_PATHS = [
  path.join(ROOT, 'ios', 'main.jsbundle'),
  path.join(ROOT, 'android', 'app', 'build', 'generated', 'assets', 'createBundleReleaseJsAndAssets', 'index.android.bundle'),
];

function checkFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, found: [], skipped: true, reason: 'file not found' };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const found = NODE_MARKERS.filter((m) => content.includes(m));
  return { path: filePath, found, skipped: false };
}

function main() {
  const cliPath = process.argv[2];
  const pathsToCheck = cliPath ? [path.resolve(ROOT, cliPath)] : DEFAULT_ARTIFACT_PATHS;

  let hadFailure = false;
  for (const p of pathsToCheck) {
    const result = checkFile(p);
    if (result.skipped) {
      console.log('[check-bundle-no-node] Skip (not found):', result.path);
      continue;
    }
    if (result.found.length > 0) {
      console.error('[check-bundle-no-node] FAIL:', result.path);
      result.found.forEach((m) => console.error('  Node marker found:', m));
      hadFailure = true;
    } else {
      console.log('[check-bundle-no-node] OK:', result.path);
    }
  }

  if (hadFailure) {
    console.error('\nRN bundle must not contain Node-only modules (fs, path, better-sqlite3, node:*, process). Fix the RN entrypoint graph and rebuild.');
    process.exit(1);
  }

  const checked = pathsToCheck.filter((p) => fs.existsSync(p));
  if (checked.length === 0) {
    console.warn('[check-bundle-no-node] No bundle file found. Build the bundle first (e.g. react-native bundle) or pass a path: node scripts/check-bundle-no-node.js <path>');
  }
}

main();
