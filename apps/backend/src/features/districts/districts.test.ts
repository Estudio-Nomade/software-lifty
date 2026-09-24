process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';
let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(users);
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const data = await res.json();
  return { status: res.status, data };
}

async function registerAndGetToken(phone: string, _password: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

beforeAll(async () => {
  app = createApp(createTestAuthPlugin());
  const db = getDb();
  const existing: any = await db.execute('SELECT count(*) AS count FROM districts WHERE name = \'Mina Clavero\' AND terms_and_conditions IS NOT NULL');
  if (Number(existing.rows[0]?.count ?? 0) === 0) {
    await db.execute(
      `UPDATE "districts" SET terms_and_conditions = 'Terms here', privacy_policy = 'Privacy here' WHERE name = 'Villa Dolores'`,
    );
    await db.execute(
      `UPDATE "districts" SET terms_and_conditions = 'Terms here', privacy_policy = 'Privacy here' WHERE name = 'Mina Clavero'`,
    );
    // Some local/test DBs only seed Villa Dolores; ensure Mina Clavero exists for list tests.
    await db.execute(`
      INSERT INTO "districts" (name, province, status, terms_and_conditions, privacy_policy)
      SELECT 'Mina Clavero', 'Córdoba', 'active', 'Terms here', 'Privacy here'
      WHERE NOT EXISTS (SELECT 1 FROM "districts" WHERE name = 'Mina Clavero')
    `);
  }
  const noTerms: any = await db.execute('SELECT count(*) AS count FROM districts WHERE name = \'Sin Terminos\'');
  if (Number(noTerms.rows[0]?.count ?? 0) === 0) {
    await db.execute(`INSERT INTO "districts" (name, province, status) VALUES ('Sin Terminos', 'Córdoba', 'active')`);
  }
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Districts', () => {
  const phone = '+5492615555555';
  const password = 'testPass123';

  test('GET /districts returns active districts with terms', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status, data } = await request('GET', '/api/districts', undefined, token);

    expect(status).toBe(200);
    expect(data.districts).toBeArray();
    expect(data.districts.length).toBeGreaterThanOrEqual(1);

    for (const d of data.districts) {
      expect(d.id).toBeString();
      expect(d.name).toBeString();
      expect(d.province).toBeString();
    }

    const names = data.districts.map((d: any) => d.name);
    expect(names).toContain('Villa Dolores');
    expect(names).toContain('Mina Clavero');
    // 'Sin Terminos' should NOT appear (no terms_and_conditions)
    expect(names).not.toContain('Sin Terminos');
  });

  test('GET /districts?province=Córdoba filters by province', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status, data } = await request('GET', '/api/districts?province=Córdoba', undefined, token);

    expect(status).toBe(200);
    for (const d of data.districts) {
      expect(d.province).toBe('Córdoba');
    }
  });

  test('GET /districts?province=SanLuis returns empty', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status, data } = await request('GET', '/api/districts?province=SanLuis', undefined, token);

    expect(status).toBe(200);
    expect(data.districts).toEqual([]);
  });

  test('GET /districts/provinces returns unique provinces', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status, data } = await request('GET', '/api/districts/provinces', undefined, token);

    expect(status).toBe(200);
    expect(data.provinces).toBeArray();
    expect(data.provinces).toContain('Córdoba');
  });

  test('GET /districts/:id returns detail with terms', async () => {
    const token = await registerAndGetToken(phone, password);
    // Get a known district id first
    const listRes = await request('GET', '/api/districts', undefined, token);
    const firstId = listRes.data.districts[0].id;

    const { status, data } = await request('GET', `/api/districts/${firstId}`, undefined, token);

    expect(status).toBe(200);
    expect(data.id).toBe(firstId);
    expect(data.terms_and_conditions).toBeString();
    expect(data.privacy_policy).toBeString();
  });

  test('GET /districts/:nonexistent returns 404', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status } = await request('GET', '/api/districts/00000000-0000-0000-0000-000000000000', undefined, token);

    expect(status).toBe(404);
  });

  test('GET /districts without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/districts');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});
