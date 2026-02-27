#!/usr/bin/env node
'use strict';
/**
 * Build-time guard: fail if the pack or app bundle contains GGUF models.
 * Prevents accidental reintroduction of models/ into assets/content_pack or .gguf into the app bundle.
 *
 * Usage:
 *   node scripts/check-pack-no-models.js
 *     Checks assets/content_pack (no models/ dir, no .gguf under assets/content_pack).
 *   node scripts/check-pack-no-models.js <path-to-bundle-or-dir>
 *     Also greps for .gguf in the given path (e.g. build output); fails if any found.
 *
 * To allow a full pack (with models) for a one-off Android build: ALLOW_PACK_WITH_MODELS=1 node scripts/check-pack-no-models.js
 * Then build; the app will copy content_pack (including models/llm/model.gguf) to device. Run sync-pack-small again before CI.
 *
 * Exit 0 if clean, 1 if models/ or .gguf detected (unless ALLOW_PACK_WITH_MODELS=1).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACK_DIR = path.join(ROOT, 'assets', 'content_pack');

function checkPackDir() {
  if (!fs.existsSync(PACK_DIR)) return { ok: true, msg: null };
  const modelsDir = path.join(PACK_DIR, 'models');
  if (fs.existsSync(modelsDir)) {
    return { ok: false, msg: `assets/content_pack/models/ exists. Remove it; the pack must not contain models.` };
  }
  function hasGguf(dir) {
    if (!fs.existsSync(dir)) return false;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (hasGguf(full)) return true;
      } else if (e.name.endsWith('.gguf')) return true;
    }
    return false;
  }
  if (hasGguf(PACK_DIR)) {
    return { ok: false, msg: `assets/content_pack contains .gguf. Exclude models from the pack.` };
  }
  return { ok: true, msg: null };
}

function grepGgufInDir(dir) {
  const found = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')) {
        walk(full);
      } else if (e.name.endsWith('.gguf')) {
        found.push(path.relative(dir, full));
      }
    }
  }
  walk(dir);
  return found;
}

const allowPackWithModels = process.env.ALLOW_PACK_WITH_MODELS === '1';
const packResult = checkPackDir();
if (!packResult.ok) {
  if (allowPackWithModels) {
    console.log('check-pack-no-models: ALLOW_PACK_WITH_MODELS=1, allowing pack with models/');
  } else {
    console.error('check-pack-no-models:', packResult.msg);
    process.exit(1);
  }
}

const bundlePath = process.argv[2];
if (bundlePath && !allowPackWithModels) {
  const abs = path.resolve(ROOT, bundlePath);
  const ggufFiles = grepGgufInDir(abs);
  if (ggufFiles.length > 0) {
    console.error('check-pack-no-models: app bundle or directory contains .gguf:', ggufFiles.join(', '));
    process.exit(1);
  }
}

console.log(allowPackWithModels ? 'check-pack-no-models: OK (ALLOW_PACK_WITH_MODELS=1)' : 'check-pack-no-models: OK (no models/ in pack, no .gguf in checked paths)');
