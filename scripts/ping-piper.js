#!/usr/bin/env node
/**
 * Ping Piper: check that the Piper TTS plugin and model files are present on disk.
 * Does not start a server; Piper runs inside the app as a native module.
 */

const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const piperRoot = path.join(root, 'plugins', 'piper-tts');
const iosModelDir = path.join(piperRoot, 'ios', 'Resources', 'piper');
const modelOnnx = path.join(iosModelDir, 'model.onnx');
const modelJson = path.join(iosModelDir, 'model.onnx.json');

function main() {
  const checks = [];
  if (!fs.existsSync(piperRoot)) {
    checks.push({ ok: false, msg: 'Piper plugin not found', path: piperRoot });
  } else {
    checks.push({ ok: true, msg: 'Piper plugin found', path: piperRoot });
  }
  if (!fs.existsSync(iosModelDir)) {
    checks.push({ ok: false, msg: 'iOS model dir missing', path: iosModelDir });
  } else {
    checks.push({ ok: true, msg: 'iOS model dir found', path: iosModelDir });
  }
  if (!fs.existsSync(modelOnnx)) {
    checks.push({ ok: false, msg: 'model.onnx missing', path: modelOnnx });
  } else {
    const stat = fs.statSync(modelOnnx);
    checks.push({ ok: true, msg: `model.onnx found (${(stat.size / 1024 / 1024).toFixed(1)} MB)`, path: modelOnnx });
  }
  if (!fs.existsSync(modelJson)) {
    checks.push({ ok: false, msg: 'model.onnx.json missing', path: modelJson });
  } else {
    checks.push({ ok: true, msg: 'model.onnx.json found', path: modelJson });
  }

  const allOk = checks.every((c) => c.ok);
  checks.forEach((c) => console.log(c.ok ? '✓' : '✗', c.msg));
  if (!allOk) {
    process.exit(1);
  }
  console.log('\nPiper model files are present. Rebuild the app (ios/android) so the bundle includes them.');
}

main();
