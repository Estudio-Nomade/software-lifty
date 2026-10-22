#!/usr/bin/env node
/**
 * Fail if SafeAreaView is imported from react-native (core).
 * Legal: react-native-safe-area-context.
 *
 * Usage: node scripts/check-no-rn-safeareaview.mjs
 * Roots: apps/mobile-passengers, apps/mobile (src + app).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { findIllegalSafeAreaViewImports } = require(
  './lib/find-illegal-rn-safeareaview.cjs',
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ROOTS = [
  path.join(REPO_ROOT, 'apps/mobile-passengers/src'),
  path.join(REPO_ROOT, 'apps/mobile-passengers/app'),
  path.join(REPO_ROOT, 'apps/mobile/src'),
  path.join(REPO_ROOT, 'apps/mobile/app'),
];

const EXT_RE = /\.(ts|tsx|js|jsx)$/;
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
const SKIP_DIR = new Set([
  'node_modules',
  '.expo',
  'dist',
  'build',
  'coverage',
  '__tests__',
  '__mocks__',
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      walk(full, out);
    } else if (EXT_RE.test(entry.name) && !TEST_FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const files = ROOTS.flatMap((root) => walk(root));
  const allHits = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    allHits.push(...findIllegalSafeAreaViewImports(file, source, REPO_ROOT));
  }

  if (allHits.length === 0) {
    console.log(
      `check-no-rn-safeareaview: ok (${files.length} files, 0 illegal SafeAreaView from react-native)`,
    );
    process.exit(0);
  }

  console.error(
    'check-no-rn-safeareaview: illegal SafeAreaView import(s) from react-native:\n',
  );
  for (const h of allHits) {
    console.error(`  ${h.file}:${h.line} (${h.kind})`);
  }
  console.error(
    '\nUse SafeAreaView from react-native-safe-area-context instead.',
  );
  process.exit(1);
}

export { findIllegalSafeAreaViewImports };

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
