#!/usr/bin/env node
'use strict';
/**
 * Sync the full content pack from mtg_rules into companion-app/assets/content_pack,
 * including models/ (GGUF). Use for a one-off "fat" build so the app can copy the
 * full pack to device once; then switch back to sync-pack-small for normal builds.
 *
 * Usage:
 *   node scripts/sync-pack-full.js [path-to-mtg_rules]
 *   MTG_RULES_PATH=/path node scripts/sync-pack-full.js
 *   pnpm run sync-pack-full
 *
 * Default source: ../mtg_rules/content_pack
 *
 * Note: validate-e2e-gates (check-pack-no-models) will fail while the full pack
 * is in place. For a one-off Android build with the model on device: run this script,
 * then build Android; the app copies content_pack (including models/llm/model.gguf) to
 * files/content_pack. To run the gates anyway use ALLOW_PACK_WITH_MODELS=1. Run
 * sync-pack-small again before CI or release if you enforce that gate.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const DEST = path.join(ASSETS, 'content_pack');

const PACK_IDENTITY_FILE = 'pack_identity.json';

function getSourceRoot(cliPath) {
  const envPath = process.env.MTG_RULES_PATH;
  if (cliPath) return path.resolve(ROOT, cliPath);
  if (envPath) return path.resolve(ROOT, envPath);
  return path.resolve(ROOT, '..', 'mtg_rules');
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256Prefix(filePath, prefixLen = 16) {
  const full = sha256File(filePath);
  return full.slice(0, prefixLen);
}

function copyRecurse(srcDir, destDir, excludeDirName) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const srcPath = path.join(srcDir, e.name);
    const destPath = path.join(destDir, e.name);
    if (excludeDirName != null && e.name === excludeDirName) continue;
    if (e.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecurse(srcPath, destPath, excludeDirName);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function run() {
  const mtgRoot = getSourceRoot(process.argv[2]);
  const sourcePack = path.join(mtgRoot, 'content_pack');

  if (!fs.existsSync(sourcePack)) {
    console.error('Error: content_pack not found at', sourcePack);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(sourcePack, 'manifest.json'))) {
    console.error('Error: manifest.json not found in', sourcePack);
    process.exit(1);
  }

  if (!fs.existsSync(ASSETS)) {
    fs.mkdirSync(ASSETS, { recursive: true });
  }
  if (fs.existsSync(DEST)) {
    fs.rmSync(DEST, { recursive: true });
  }
  fs.mkdirSync(DEST, { recursive: true });

  // Copy everything including models/ (no exclusion)
  copyRecurse(sourcePack, DEST, null);
  console.log('Synced full pack (including models/) to', DEST);

  // Build pack_identity.json from source paths
  const manifestPath = path.join(sourcePack, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const packVersion = manifest.pack_version ?? manifest.built_at ?? null;
  const manifestSha = sha256File(manifestPath);
  const identity = {
    pack_version: packVersion,
    pack_manifest_sha: manifestSha,
    timestamp: new Date().toISOString(),
  };

  const routerMapPath = path.join(sourcePack, 'router', 'router_map.json');
  if (fs.existsSync(routerMapPath)) {
    identity.router_map_sha256 = sha256File(routerMapPath);
    identity.router_map_sha256_prefix = sha256Prefix(routerMapPath);
  }

  const contextProvider = manifest.sidecars?.capabilities?.context_provider;
  const files = contextProvider?.files ?? {};
  const rulesDbPath = files.rules_db?.path ? path.join(sourcePack, files.rules_db.path) : path.join(sourcePack, 'rules', 'rules.db');
  const cardsDbPath = files.cards_db?.path ? path.join(sourcePack, files.cards_db.path) : path.join(sourcePack, 'cards', 'cards.db');
  if (fs.existsSync(rulesDbPath)) {
    identity.rules_db_hash = sha256File(rulesDbPath);
  }
  if (fs.existsSync(cardsDbPath)) {
    identity.cards_db_hash = sha256File(cardsDbPath);
  }

  const specPath = path.join(sourcePack, 'context_provider_spec.json');
  if (fs.existsSync(specPath)) {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    identity.context_provider_spec_hash = sha256File(specPath);
    if (spec.schema_version != null) identity.context_provider_spec_schema_version = spec.schema_version;
  }

  const identityPath = path.join(DEST, PACK_IDENTITY_FILE);
  fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2) + '\n');
  console.log('Wrote', PACK_IDENTITY_FILE);
  console.log('Next: build the app once; on first launch the app will copy this pack to device. For normal builds, run pnpm run sync-pack-small again.');
}

run();
