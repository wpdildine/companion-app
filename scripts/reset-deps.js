#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

function removeNodeModules() {
  if (!fs.existsSync(NODE_MODULES)) {
    console.log('[deps:reset] node_modules already absent');
    return;
  }

  console.log('[deps:reset] Removing node_modules...');
  try {
    fs.rmSync(NODE_MODULES, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } catch (error) {
    const renamedPath = path.join(ROOT, `.node_modules-delete-${Date.now()}`);
    console.warn(
      `[deps:reset] Direct removal failed (${error.code || error.message}); renaming fallback...`
    );
    fs.renameSync(NODE_MODULES, renamedPath);
    try {
      fs.rmSync(renamedPath, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    } catch (renameRemovalError) {
      console.warn(
        `[deps:reset] Node removal after rename failed (${renameRemovalError.code || renameRemovalError.message}); using shell fallback...`
      );
      execSync(`/bin/rm -rf "${renamedPath}"`, { cwd: ROOT, stdio: 'inherit' });
    }
  }

  if (fs.existsSync(NODE_MODULES)) {
    throw new Error('node_modules still exists after removal attempts');
  }
}

function main() {
  removeNodeModules();
  console.log('[deps:reset] Reinstalling dependencies...');
  execSync('pnpm run deps:install', { cwd: ROOT, stdio: 'inherit' });
}

main();
