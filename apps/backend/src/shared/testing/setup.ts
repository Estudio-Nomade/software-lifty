process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.REDIS_URL = undefined;

import { beforeEach } from 'bun:test';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, resetDb } from '../db/client';
import { getRedis } from '../lib/redis';

const db = getDb();

await migrate(db, { migrationsFolder: './src/shared/db/migrations' });

const COLUMNS_REQUIRED: Record<string, string[]> = {
  users: ['kyc_status', 'verified_name', 'verified_document_hash', 'document_number_last4'],
  drivers: ['admin_review_status', 'admin_reviewed_by', 'admin_reviewed_at', 'admin_review_notes'],
  trips: ['assigned_at'],
};

for (const [table, columns] of Object.entries(COLUMNS_REQUIRED)) {
  const result = await db.execute<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name='${table}' AND column_name = ANY(ARRAY[${columns.map((c) => `'${c}'`).join(',')}]);`,
  );
  const found = new Set((result.rows as { column_name: string }[]).map((r) => r.column_name));
  const missing = columns.filter((c) => !found.has(c));
  if (missing.length > 0) {
    throw new Error(
      `[TEST SETUP] Columns missing in "${table}": ${missing.join(', ')}. Run "bun run db:migrate" or "bun run setup" to apply migrations.`,
    );
  }
}

resetDb();

beforeEach(async () => {
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch {
      /* best-effort */
    }
  }
});
