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
import { fileURLToPath } from 'node:url';

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

/** Named or default import of SafeAreaView from 'react-native' / "react-native" (multi-line). */
const ILLEGAL_IMPORT_RE =
  /import\s+(?:(?:type\s+)?(?:\{[\s\S]*?\bSafeAreaView\b[\s\S]*?\}|\*\s+as\s+\w+|SafeAreaView(?:\s*,\s*\{[\s\S]*?\})?)\s+from\s+['"]react-native['"]|\{[\s\S]*?\bSafeAreaView\b[\s\S]*?\}\s+from\s+['"]react-native['"])/;

const ILLEGAL_REQUIRE_RE =
  /(?:const|let|var)\s+\{[\s\S]*?\bSafeAreaView\b[\s\S]*?\}\s*=\s*require\s*\(\s*['"]react-native['"]\s*\)/;

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

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * @param {string} filePath
 * @param {string} source
 * @returns {{ file: string, line: number, kind: string }[]}
 */
export function findIllegalSafeAreaViewImports(filePath, source) {
  const hits = [];
  const rel = path.relative(REPO_ROOT, filePath);

  for (const match of source.matchAll(
    new RegExp(ILLEGAL_IMPORT_RE.source, 'g'),
  )) {
    hits.push({
      file: rel,
      line: lineOf(source, match.index ?? 0),
      kind: 'import',
    });
  }

  for (const match of source.matchAll(
    new RegExp(ILLEGAL_REQUIRE_RE.source, 'g'),
  )) {
    hits.push({
      file: rel,
      line: lineOf(source, match.index ?? 0),
      kind: 'require',
    });
  }

  return hits;
}

function main() {
  const files = ROOTS.flatMap((root) => walk(root));
  const allHits = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    allHits.push(...findIllegalSafeAreaViewImports(file, source));
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

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
