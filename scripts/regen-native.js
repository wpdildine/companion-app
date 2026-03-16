#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { getAppIdentity } = require('./app-identity');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

function ensureNode22() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    console.error(
      `[regen-native] Node 22+ required. Current: ${process.versions.node}. Use: nvm use 22`
    );
    process.exit(1);
  }
}

function reactNativeVersion() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const version = pkg.dependencies && pkg.dependencies['react-native'];
  if (!version) {
    throw new Error('react-native dependency not found in package.json');
  }
  return version;
}

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function main() {
  ensureNode22();
  const identity = getAppIdentity();
  const rnVersion = reactNativeVersion();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas00-native-regen-'));
  const seedDir = path.join(tempRoot, identity.projectName);

  console.log('[regen-native] temp dir:', tempRoot);
  console.log('[regen-native] generating fresh native projects with RN', rnVersion);
  run(
    [
      'npx @react-native-community/cli init',
      identity.projectName,
      `--version ${rnVersion}`,
      '--skip-install',
      '--skip-git-init',
      '--pm npm',
      `--package-name ${identity.packageName}`,
      `--title ${identity.displayName}`,
      `--directory "${seedDir}"`,
    ].join(' '),
    ROOT
  );

  const newIos = path.join(seedDir, 'ios');
  const newAndroid = path.join(seedDir, 'android');
  if (!fs.existsSync(newIos) || !fs.existsSync(newAndroid)) {
    throw new Error('[regen-native] generated ios/android folders not found');
  }

  const iosPath = path.join(ROOT, 'ios');
  const androidPath = path.join(ROOT, 'android');
  // Safe to have already deleted these; we replace them from the temp project.
  if (fs.existsSync(iosPath)) fs.rmSync(iosPath, { recursive: true, force: true });
  if (fs.existsSync(androidPath)) fs.rmSync(androidPath, { recursive: true, force: true });

  fs.cpSync(newIos, iosPath, { recursive: true });
  fs.cpSync(newAndroid, androidPath, { recursive: true });
  console.log('[regen-native] copied fresh ios/ and android/');

  run('node scripts/apply-native-overrides.js', ROOT);

  console.log('[regen-native] done.');
  console.log('[regen-native] next steps:');
  console.log('  1) pnpm run native:pods');
  console.log('  2) pnpm run rag:pack');
  console.log('  3) Run pnpm run deps:reset first if you also need a dependency wipe');
}

main();
