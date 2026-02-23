/**
 * Ensures any Node-side usage of the runtime in this repo uses the Node entrypoint.
 * Scripts and tests must import @mtg/runtime/node, not @mtg/runtime (RN entry).
 * App source (src/, App.tsx) is enforced by ESLint; this script covers scripts/ and __tests__/.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NODE_ENTRY = '@mtg/runtime/node';
const RN_ENTRY = '@mtg/runtime';

const DIRS = ['scripts', '__tests__'];
const EXTENSIONS = ['.js', '.ts', '.tsx', '.mjs', '.cjs'];

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.some((ext) => e.name.endsWith(ext))) yield full;
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const violations = [];
for (const d of DIRS) {
  const dirPath = path.join(ROOT, d);
  for (const file of walk(dirPath)) {
    const rel = path.relative(ROOT, file);
    if (path.basename(file) === 'verify-parity-uses-node.js') continue;
    const content = fs.readFileSync(file, 'utf8');
    // Match require('@mtg/runtime') or from '@mtg/runtime' but not @mtg/runtime/node
    const badRequire = new RegExp(`require\\s*\\(\\s*['"]${escapeRe(RN_ENTRY)}['"]\\s*\\)`, 'g');
    const badFrom = new RegExp(`from\\s+['"]${escapeRe(RN_ENTRY)}['"]\\s*[;\\n]`, 'g');
    if (badRequire.test(content) || badFrom.test(content)) {
      violations.push({ file: rel, message: `Must use ${NODE_ENTRY} in Node/parity code, not ${RN_ENTRY}` });
    }
  }
}

if (violations.length > 0) {
  console.error('verify-parity-uses-node: Node/parity code must import @mtg/runtime/node:\n');
  violations.forEach((v) => console.error(`  ${v.file}: ${v.message}`));
  process.exit(1);
}
console.log('verify-parity-uses-node: OK (no default runtime entry in scripts/ or __tests__/)');
