import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Same module the CI script uses (single source of truth).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  findIllegalSafeAreaViewImports,
} = require('../../../../../scripts/lib/find-illegal-rn-safeareaview.cjs') as {
  findIllegalSafeAreaViewImports: (
    filePath: string,
    source: string,
    repoRoot?: string,
  ) => { file: string; line: number; kind: string }[];
};

const repoRoot = path.resolve(__dirname, '../../../../../');
const scriptPath = path.join(repoRoot, 'scripts/check-no-rn-safeareaview.mjs');

describe('no SafeAreaView from react-native', () => {
  test('CI script exits 0 on current sources', () => {
    const out = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      cwd: repoRoot,
    });
    expect(out).toMatch(/0 illegal/);
  });

  test('detects illegal named import from react-native', () => {
    const sample = `import { View, SafeAreaView } from 'react-native';\n`;
    const hits = findIllegalSafeAreaViewImports('x.tsx', sample, '.');
    expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual(['x.tsx:1']);
  });

  test('detects multi-line import from react-native', () => {
    const sample = `import {\n  View,\n  SafeAreaView,\n} from "react-native";\n`;
    const hits = findIllegalSafeAreaViewImports('x.tsx', sample, '.');
    expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual(['x.tsx:1']);
  });

  test('detects default import SafeAreaView from react-native', () => {
    const sample = `import SafeAreaView from 'react-native';\n`;
    const hits = findIllegalSafeAreaViewImports('x.tsx', sample, '.');
    expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual(['x.tsx:1']);
  });

  test('allows SafeAreaView from react-native-safe-area-context', () => {
    const sample = `import { SafeAreaView } from 'react-native-safe-area-context';\n`;
    expect(findIllegalSafeAreaViewImports('x.tsx', sample, '.')).toEqual([]);
  });

  test('allows namespace import from react-native without SafeAreaView name', () => {
    const sample = `import * as RN from 'react-native';\n`;
    expect(findIllegalSafeAreaViewImports('x.tsx', sample, '.')).toEqual([]);
  });
});
