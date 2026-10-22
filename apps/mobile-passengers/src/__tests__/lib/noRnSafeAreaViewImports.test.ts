import fs from 'node:fs';
import path from 'node:path';

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

const ILLEGAL_IMPORT_RE =
  /import\s+(?:(?:type\s+)?(?:\{[\s\S]*?\bSafeAreaView\b[\s\S]*?\}|\*\s+as\s+\w+|SafeAreaView(?:\s*,\s*\{[\s\S]*?\})?)\s+from\s+['"]react-native['"]|\{[\s\S]*?\bSafeAreaView\b[\s\S]*?\}\s+from\s+['"]react-native['"])/;

const ILLEGAL_REQUIRE_RE =
  /(?:const|let|var)\s+\{[\s\S]*?\bSafeAreaView\b[\s\S]*?\}\s*=\s*require\s*\(\s*['"]react-native['"]\s*\)/;

function walk(dir: string, out: string[] = []): string[] {
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

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function findIllegal(filePath: string, source: string, root: string) {
  const hits: string[] = [];
  const rel = path.relative(root, filePath);

  for (const match of source.matchAll(new RegExp(ILLEGAL_IMPORT_RE.source, 'g'))) {
    hits.push(`${rel}:${lineOf(source, match.index ?? 0)}`);
  }
  for (const match of source.matchAll(new RegExp(ILLEGAL_REQUIRE_RE.source, 'g'))) {
    hits.push(`${rel}:${lineOf(source, match.index ?? 0)}`);
  }
  return hits;
}

describe('no SafeAreaView from react-native', () => {
  const appRoot = path.resolve(__dirname, '../../..');
  const roots = [path.join(appRoot, 'src'), path.join(appRoot, 'app')];

  test('sources must not import SafeAreaView from react-native', () => {
    const files = roots.flatMap((r) => walk(r));
    const illegal: string[] = [];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      illegal.push(...findIllegal(file, source, appRoot));
    }

    expect(illegal).toEqual([]);
  });

  test('detects illegal named import from react-native', () => {
    const sample = `import { View, SafeAreaView } from 'react-native';\n`;
    expect(findIllegal('x.tsx', sample, '.')).toEqual(['x.tsx:1']);
  });

  test('detects multi-line import from react-native', () => {
    const sample = `import {\n  View,\n  SafeAreaView,\n} from "react-native";\n`;
    expect(findIllegal('x.tsx', sample, '.')).toEqual(['x.tsx:1']);
  });

  test('allows SafeAreaView from react-native-safe-area-context', () => {
    const sample = `import { SafeAreaView } from 'react-native-safe-area-context';\n`;
    expect(findIllegal('x.tsx', sample, '.')).toEqual([]);
  });
});
