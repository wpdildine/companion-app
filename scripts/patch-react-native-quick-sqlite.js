#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bindingsTarget = path.join(
  root,
  'node_modules',
  'react-native-quick-sqlite',
  'cpp',
  'bindings.cpp'
);
const iosTarget = path.join(
  root,
  'node_modules',
  'react-native-quick-sqlite',
  'ios',
  'QuickSQLite.mm'
);

function patchFile(filePath, from, to, label) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-quick-sqlite] ${label} target not found, skipping.`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(to)) {
    console.log(`[patch-quick-sqlite] ${label} already patched.`);
    return;
  }
  if (!content.includes(from)) {
    console.log(`[patch-quick-sqlite] ${label} pattern not found, skipping.`);
    return;
  }

  fs.writeFileSync(filePath, content.replace(from, to));
  console.log(`[patch-quick-sqlite] patched ${label}.`);
}

patchFile(
  bindingsTarget,
  '  auto pool = std::make_shared<ThreadPool>();',
  `  // Intentionally leak the async pool to avoid destructor-time thread joins
  // during bridge/runtime teardown in development.
  auto pool = std::shared_ptr<ThreadPool>(new ThreadPool(), [](ThreadPool *) {});`,
  'bindings thread pool ownership'
);

patchFile(
  iosTarget,
  `- (void)invalidate {
  osp::clearState();
}`,
  `- (void)invalidate {
#if DEBUG
  return;
#endif
  osp::clearState();
}`,
  'iOS invalidate'
);
