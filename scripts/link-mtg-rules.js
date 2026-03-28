#!/usr/bin/env node
'use strict';
/**
 * Symlink manager for linking the pack_runtime repo into the companion-app.
 * Creates:
 *   - assets/content_pack → <pack_runtime>/content_pack (optional dev convenience; build must NOT depend on this)
 *   - Ensures @atlas/runtime is linked to <pack_runtime>/runtime-ts (via package.json file: dep + pnpm install)
 *
 * Build contract: The app build always uses a real assets/content_pack directory. Run
 *   pnpm run rag:pack
 * to materialize the stripped pack (no models) and pack_identity.json. Use this script's
 * "link" only for local dev convenience; CI and release should run rag:pack so
 * Gradle/Xcode see real files.
 *
 * Usage:
 *   node scripts/link-mtg-rules.js link [path-to-pack_runtime] [--deps]
 *   node scripts/link-mtg-rules.js unlink
 *   node scripts/link-mtg-rules.js status [path-to-pack_runtime]
 *
 * With --deps: add @atlas/runtime to dependencies (for when app source imports the RN provider).
 * Without --deps: add to devDependencies only (scripts/tests only; do not import in src/).
 * Default path is sibling ../pack_runtime. Override with MTG_RULES_PATH env or the optional path argument.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const CONTENT_PACK_LINK = path.join(ASSETS, 'content_pack');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const RUNTIME_DEP_NAME = '@atlas/runtime';

function getMtgRulesPath(cliPath) {
  const envPath = process.env.MTG_RULES_PATH;
  if (cliPath) return path.resolve(ROOT, cliPath);
  if (envPath) return path.resolve(ROOT, envPath);
  return path.resolve(ROOT, '..', 'pack_runtime');
}

function ensureAssetsDir() {
  if (!fs.existsSync(ASSETS)) {
    fs.mkdirSync(ASSETS, { recursive: true });
  }
}

function describeTarget(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    return { ok: false, message: `${label} missing: ${targetPath}` };
  }
  const stat = fs.statSync(targetPath);
  if (stat.isSymbolicLink()) {
    const dest = fs.readlinkSync(targetPath);
    const destResolved = path.resolve(path.dirname(targetPath), dest);
    const destExists = fs.existsSync(destResolved);
    return {
      ok: destExists,
      message: `${label} → ${dest} (${
        destExists ? 'target exists' : 'target missing'
      })`,
      isLink: true,
    };
  }
  if (stat.isDirectory()) {
    return {
      ok: true,
      message: `${label} is a directory (not a symlink)`,
      isLink: false,
    };
  }
  return { ok: false, message: `${label} exists but is not a directory/link` };
}

function status(mtgRoot) {
  console.log('pack_runtime path:', mtgRoot);
  console.log('');

  const contentPackTarget = path.join(mtgRoot, 'content_pack');
  const runtimeTarget = path.join(mtgRoot, 'runtime-ts');

  // Content pack link
  const packDesc = describeTarget(CONTENT_PACK_LINK, 'assets/content_pack');
  console.log('content_pack:', packDesc.message);

  // Runtime: check package.json (devDependencies or dependencies) and node_modules
  let runtimeMessage;
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const devDeps = pkg.devDependencies || {};
  const deps = pkg.dependencies || {};
  const runtimeDep = deps[RUNTIME_DEP_NAME] || devDeps[RUNTIME_DEP_NAME];
  if (runtimeDep && runtimeDep.startsWith('file:')) {
    const resolved = path.resolve(ROOT, runtimeDep.slice('file:'.length));
    const exists = fs.existsSync(resolved);
    runtimeMessage = `@atlas/runtime: ${runtimeDep} (${
      exists ? 'path exists' : 'path missing'
    })`;
  } else if (runtimeDep) {
    runtimeMessage = `@atlas/runtime: ${runtimeDep} (not a file: link)`;
  } else {
    runtimeMessage = '@atlas/runtime: not in package.json devDependencies';
  }
  const inDeps = pkg.dependencies && pkg.dependencies[RUNTIME_DEP_NAME];
  if (inDeps) {
    runtimeMessage += ' (in dependencies — for app import of RN provider)';
  }
  console.log('runtime:', runtimeMessage);

  const contentPackSourceExists = fs.existsSync(contentPackTarget);
  const runtimeSourceExists = fs.existsSync(runtimeTarget);
  console.log('');
  console.log('Source directories in pack_runtime:');
  console.log(
    '  content_pack:',
    contentPackSourceExists ? 'exists' : 'missing',
  );
  console.log('  runtime-ts:', runtimeSourceExists ? 'exists' : 'missing');
}

function link(mtgRoot) {
  ensureAssetsDir();

  const contentPackTarget = path.join(mtgRoot, 'content_pack');
  const runtimeTarget = path.join(mtgRoot, 'runtime-ts');

  if (!fs.existsSync(contentPackTarget)) {
    console.error('Error: content_pack not found at', contentPackTarget);
    process.exit(1);
  }
  if (!fs.existsSync(runtimeTarget)) {
    console.error('Error: runtime-ts not found at', runtimeTarget);
    process.exit(1);
  }

  // 1. Symlink assets/content_pack
  if (fs.existsSync(CONTENT_PACK_LINK)) {
    const stat = fs.statSync(CONTENT_PACK_LINK);
    if (stat.isSymbolicLink()) {
      const current = fs.readlinkSync(CONTENT_PACK_LINK);
      const resolved = path.resolve(path.dirname(CONTENT_PACK_LINK), current);
      if (path.resolve(resolved) === path.resolve(contentPackTarget)) {
        console.log(
          'assets/content_pack already linked to pack_runtime/content_pack',
        );
      } else {
        fs.unlinkSync(CONTENT_PACK_LINK);
        fs.symlinkSync(contentPackTarget, CONTENT_PACK_LINK, 'dir');
        console.log('assets/content_pack relinked to', contentPackTarget);
      }
    } else {
      console.error(
        'Error: assets/content_pack exists and is not a symlink. Remove it manually to link.',
      );
      process.exit(1);
    }
  } else {
    fs.symlinkSync(contentPackTarget, CONTENT_PACK_LINK, 'dir');
    console.log('Linked assets/content_pack →', contentPackTarget);
  }

  // 2. Add or update @atlas/runtime in package.json (dependencies or devDependencies per --deps)
  const useDeps = process.argv.includes('--deps');
  const relRuntime = path.relative(ROOT, runtimeTarget);
  const fileRef =
    'file:' + (path.sep === '\\' ? relRuntime.replace(/\\/g, '/') : relRuntime);
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const targetSection = useDeps ? 'dependencies' : 'devDependencies';
  const otherSection = useDeps ? 'devDependencies' : 'dependencies';
  const current = (pkg[targetSection] || {})[RUNTIME_DEP_NAME];
  if (current !== fileRef) {
    pkg[targetSection] = pkg[targetSection] || {};
    pkg[targetSection][RUNTIME_DEP_NAME] = fileRef;
    if (pkg[otherSection] && pkg[otherSection][RUNTIME_DEP_NAME]) {
      delete pkg[otherSection][RUNTIME_DEP_NAME];
    }
    fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');
    console.log(
      'Added @atlas/runtime to package.json ' + targetSection + ':',
      fileRef,
    );
    console.log('Running pnpm install...');
    execSync('pnpm install', { cwd: ROOT, stdio: 'inherit' });
    console.log(
      useDeps
        ? '@atlas/runtime linked for app import (dependencies).'
        : '@atlas/runtime linked (scripts/tests only; devDependencies).',
    );
  } else {
    console.log(
      '@atlas/runtime already set in package.json. Run pnpm install if needed.',
    );
  }

  console.log('');
  console.log('Done. Run "node scripts/link-mtg-rules.js status" to verify.');
  console.log('');
  console.log(
    'Packaging: For release build, run "pnpm run rag:pack" so assets/content_pack is a real directory (no models/). iOS build will fail if content_pack is still a symlink.',
  );
}

function unlink() {
  // Remove content_pack symlink only (do not remove directory if it's not a link)
  if (fs.existsSync(CONTENT_PACK_LINK)) {
    const stat = fs.statSync(CONTENT_PACK_LINK);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(CONTENT_PACK_LINK);
      console.log('Removed symlink assets/content_pack');
    } else {
      console.error(
        'assets/content_pack is not a symlink. Remove it manually if desired.',
      );
    }
  } else {
    console.log('assets/content_pack link not present');
  }

  // Remove @atlas/runtime from package.json (dependencies and devDependencies) and run pnpm install
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  let removed = false;
  if (pkg.dependencies && pkg.dependencies[RUNTIME_DEP_NAME]) {
    delete pkg.dependencies[RUNTIME_DEP_NAME];
    removed = true;
  }
  if (pkg.devDependencies && pkg.devDependencies[RUNTIME_DEP_NAME]) {
    delete pkg.devDependencies[RUNTIME_DEP_NAME];
    removed = true;
  }
  if (removed) {
    fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');
    console.log('Removed @atlas/runtime from package.json');
    console.log('Running pnpm install...');
    execSync('pnpm install', { cwd: ROOT, stdio: 'inherit' });
    console.log('Done.');
  } else {
    console.log('@atlas/runtime not in package.json');
  }
}

const cmd = process.argv[2];
const pathArg = process.argv[3];

if (cmd === 'link') {
  const mtgRoot = getMtgRulesPath(pathArg);
  link(mtgRoot);
} else if (cmd === 'unlink') {
  unlink();
} else if (cmd === 'status' || !cmd) {
  const mtgRoot = getMtgRulesPath(pathArg);
  status(mtgRoot);
} else {
  console.log(
    'Usage: node scripts/link-mtg-rules.js <link|unlink|status> [path-to-pack_runtime]',
  );
  console.log(
    '  link [path] [--deps] - Link content_pack and @atlas/runtime (--deps = add to dependencies for app import)',
  );
  console.log(
    '  unlink        - Remove symlinks and @atlas/runtime dependency',
  );
  console.log('  status [path] - Show current link state');
  console.log('  Set MTG_RULES_PATH to override default path.');
  process.exit(1);
}
