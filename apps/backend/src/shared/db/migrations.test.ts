import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const MIGRATIONS_DIR = './src/shared/db/migrations';
const JOURNAL_PATH = `${MIGRATIONS_DIR}/meta/_journal.json`;

describe('drizzle migration journal', () => {
  test('every .sql migration has an entry in _journal.json', () => {
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as {
      entries: { tag: string }[];
    };
    const tags = new Set(journal.entries.map((e) => e.tag));

    const sqlFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const missing = sqlFiles.filter((f) => !tags.has(f.replace(/\.sql$/, '')));

    expect(missing).toEqual([]);
  });
});
