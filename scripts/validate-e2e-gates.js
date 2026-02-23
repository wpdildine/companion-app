#!/usr/bin/env node
'use strict';
/**
 * Run integration gates before app test or release.
 * 1) Parity/tools use @mtg/runtime/node (not default RN entry).
 * 2) Pack has no models/ or .gguf.
 * 3) If a built RN bundle exists, it must not contain Node-only markers.
 *
 * For full E2E: build the bundle (e.g. react-native bundle), then run this script.
 * Node parity suite (in mtg_rules) must be run separately using @mtg/runtime/node.
 *
 * Usage: node scripts/validate-e2e-gates.js [bundle-path]
 *   With no arg: runs (1)(2) and (3) for default artifact paths if present.
 *   With bundle-path: runs (1)(2)(3) on that bundle file.
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run(name, cmd) {
  console.log(`[validate-e2e-gates] ${name}...`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.error(`[validate-e2e-gates] ${name} failed`);
    process.exit(1);
  }
}

run('Parity uses Node entrypoint', 'node scripts/verify-parity-uses-node.js');
run('Pack has no models', 'node scripts/check-pack-no-models.js');

const bundleArg = process.argv[2];
const checkBundle = bundleArg
  ? `node scripts/check-bundle-no-node.js ${path.resolve(ROOT, bundleArg)}`
  : 'node scripts/check-bundle-no-node.js';
run('Bundle has no Node-only modules', checkBundle);

console.log('[validate-e2e-gates] All gates passed.');