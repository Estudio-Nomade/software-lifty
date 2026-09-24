/**
 * Applies 0044_push_tokens_web against DATABASE_URL (Transaction pooler wabdd).
 * Usage: DATABASE_URL=... bun run scripts/apply-web-push-migration.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = join(root, 'src/shared/db/migrations/0044_push_tokens_web.sql');
const sql = readFileSync(sqlPath, 'utf8');

const pool = new Pool({
  connectionString: url,
  ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
});

try {
  await pool.query(sql);
  const cols = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_tokens'
    ORDER BY ordinal_position
  `);
  console.log(
    'push_tokens:',
    cols.rows.map((r: { column_name: string; data_type: string }) => `${r.column_name}:${r.data_type}`).join(', '),
  );
  console.log('OK 0044_push_tokens_web');
} finally {
  await pool.end();
}
