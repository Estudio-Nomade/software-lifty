'use strict';

const path = require('node:path');

/**
 * Named / default import of SafeAreaView from 'react-native' or "react-native"
 * (multi-line braces OK). Does NOT match bare `import * as RN from 'react-native'`.
 */
const ILLEGAL_IMPORT_RES = [
  /import\s+(?:type\s+)?\{[\s\S]*?\bSafeAreaView\b[\s\S]*?\}\s+from\s+['"]react-native['"]/g,
  /import\s+(?:type\s+)?SafeAreaView(?:\s*,\s*\{[\s\S]*?\})?\s+from\s+['"]react-native['"]/g,
];

const ILLEGAL_REQUIRE_RE =
  /(?:const|let|var)\s+\{[\s\S]*?\bSafeAreaView\b[\s\S]*?\}\s*=\s*require\s*\(\s*['"]react-native['"]\s*\)/g;

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * @param {string} filePath
 * @param {string} source
 * @param {string} [repoRoot='.']
 * @returns {{ file: string, line: number, kind: string }[]}
 */
function findIllegalSafeAreaViewImports(filePath, source, repoRoot = '.') {
  const hits = [];
  const rel = path.relative(repoRoot, filePath);

  for (const pattern of ILLEGAL_IMPORT_RES) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      hits.push({
        file: rel,
        line: lineOf(source, match.index ?? 0),
        kind: 'import',
      });
    }
  }

  ILLEGAL_REQUIRE_RE.lastIndex = 0;
  for (const match of source.matchAll(ILLEGAL_REQUIRE_RE)) {
    hits.push({
      file: rel,
      line: lineOf(source, match.index ?? 0),
      kind: 'require',
    });
  }

  return hits;
}

module.exports = { findIllegalSafeAreaViewImports };
