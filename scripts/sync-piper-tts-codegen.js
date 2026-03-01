#!/usr/bin/env node
'use strict';
/**
 * Ensures the TurboModule spec NativePiperTts.ts and errors.ts are present under
 * node_modules/piper-tts/src so React Native codegen and Metro can resolve piper-tts
 * from node_modules. With file:./plugins/piper-tts, package managers may copy instead
 * of symlink, so node_modules/piper-tts/src can be stale and missing these files.
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const pluginSrc = path.join(projectRoot, 'plugins', 'piper-tts', 'src');
const nodeModulesSrc = path.join(projectRoot, 'node_modules', 'piper-tts', 'src');

const filesToSync = ['NativePiperTts.ts', 'errors.ts'];

function run() {
  if (!fs.existsSync(path.join(projectRoot, 'node_modules', 'piper-tts'))) return;

  if (!fs.existsSync(nodeModulesSrc)) {
    fs.mkdirSync(nodeModulesSrc, { recursive: true });
  }

  for (const name of filesToSync) {
    const from = path.join(pluginSrc, name);
    const to = path.join(nodeModulesSrc, name);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, to);
    }
  }
}

run();
