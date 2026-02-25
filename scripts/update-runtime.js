#!/usr/bin/env node
'use strict';
/**
 * Update the app to use the latest @mtg/runtime from mtg_rules/runtime-ts.
 * Reads version from the runtime-ts package (single source of truth). Sets
 * package.json file: ref and runs pnpm install so node_modules/@mtg/runtime
 * is fresh. Does not touch assets/content_pack.
 *
 * Usage: pnpm run update-runtime [path-to-mtg_rules]
 * Default path: ../mtg_rules (or set MTG_RULES_PATH).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const RUNTIME_DEP_NAME = '@mtg/runtime';

function getMtgRulesPath(cliPath) {
  if (cliPath) return path.resolve(ROOT, cliPath);
  if (process.env.MTG_RULES_PATH) return path.resolve(ROOT, process.env.MTG_RULES_PATH);
  return path.resolve(ROOT, '..', 'mtg_rules');
}

const mtgRoot = getMtgRulesPath(process.argv[2]);
const runtimePath = path.join(mtgRoot, 'runtime-ts');

if (!fs.existsSync(runtimePath)) {
  console.error('[update-runtime] Error: runtime-ts not found at', runtimePath);
  process.exit(1);
}

const runtimePkgPath = path.join(runtimePath, 'package.json');
if (!fs.existsSync(runtimePkgPath)) {
  console.error('[update-runtime] Error: runtime-ts/package.json not found at', runtimePkgPath);
  process.exit(1);
}
const runtimePkg = JSON.parse(fs.readFileSync(runtimePkgPath, 'utf8'));
const runtimeVersion = runtimePkg.version;

console.log('[update-runtime] Linking from:', runtimePath);
console.log('[update-runtime] @mtg/runtime version (from that package.json):', runtimeVersion);

const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));

const relRuntime = path.relative(ROOT, runtimePath);
const fileRef = 'file:' + (path.sep === '\\' ? relRuntime.replace(/\\/g, '/') : relRuntime);

// Ensure @mtg/runtime is in dependencies (app imports it)
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies[RUNTIME_DEP_NAME] = fileRef;
if (pkg.devDependencies && pkg.devDependencies[RUNTIME_DEP_NAME]) {
  delete pkg.devDependencies[RUNTIME_DEP_NAME];
}

fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');
console.log('[update-runtime] package.json @mtg/runtime →', fileRef);

const nodeModulesRuntime = path.join(ROOT, 'node_modules', RUNTIME_DEP_NAME);
if (fs.existsSync(nodeModulesRuntime)) {
  fs.rmSync(nodeModulesRuntime, { recursive: true });
  console.log('[update-runtime] Removed existing node_modules/@mtg/runtime so pnpm recreates it.');
}
console.log('[update-runtime] Running pnpm install...');
execSync('pnpm install', { cwd: ROOT, stdio: 'inherit' });
console.log('[update-runtime] Done. Linked runtime-ts version', runtimeVersion, 'from', runtimePath);
console.log('');
console.log('If the app is running: restart Metro with cache reset so it picks up changes:');
console.log('  pnpm start -- --reset-cache');
