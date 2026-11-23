process.env.NODE_ENV = 'test';
process.env.REDIS_URL = undefined;
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

async function request(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  token?: string,
  body?: object,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data: data as Record<string, unknown> };
}

describe('POST /api/auth/legal-accept + GET /me legal', () => {
  const db = getDb();

  beforeEach(async () => {
    await db.delete(users);
  });

  test('returns 401 without auth', async () => {
    const app = createApp();
    const { status } = await request(app, 'POST', '/api/auth/legal-accept', undefined, {
      terms_version: '0.1.1-borrador',
      privacy_version: '1.0.0',
    });
    expect(status).toBe(401);
  });

  test('persists versions and exposes legal on /me', async () => {
    const app = createApp();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492610000099', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const accept = await request(app, 'POST', '/api/auth/legal-accept', token, {
      terms_version: '0.1.1-borrador',
      privacy_version: '1.0.0',
    });
    expect(accept.status).toBe(200);
    expect(accept.data.terms_version).toBe('0.1.1-borrador');
    expect(accept.data.privacy_version).toBe('1.0.0');
    expect(typeof accept.data.terms_accepted_at).toBe('string');
    expect(accept.data.role).toBe('driver');

    const [row] = await db
      .select({
        terms_version: users.terms_version,
        privacy_version: users.privacy_version,
        terms_accepted_at: users.terms_accepted_at,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    expect(row.terms_version).toBe('0.1.1-borrador');
    expect(row.privacy_version).toBe('1.0.0');
    expect(row.terms_accepted_at).toBeTruthy();

    const me = await request(app, 'GET', '/api/auth/me', token);
    expect(me.status).toBe(200);
    const legal = me.data.legal as Record<string, unknown>;
    expect(legal.terms_version).toBe('0.1.1-borrador');
    expect(legal.privacy_version).toBe('1.0.0');
    expect(typeof legal.terms_accepted_at).toBe('string');
  });

  test('idempotent when same versions already accepted', async () => {
    const app = createApp();
    const [user] = await db
      .insert(users)
      .values({
        phone: '+5492610000098',
        role: 'passenger',
        terms_version: '0.1.1-borrador',
        privacy_version: '1.0.0',
        terms_accepted_at: new Date('2026-01-01T12:00:00.000Z'),
      })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const accept = await request(app, 'POST', '/api/auth/legal-accept', token, {
      terms_version: '0.1.1-borrador',
      privacy_version: '1.0.0',
      user_type: 'passenger',
    });
    expect(accept.status).toBe(200);
    expect(accept.data.terms_accepted_at).toBe('2026-01-01T12:00:00.000Z');
    expect(accept.data.role).toBe('passenger');
  });

  test('rejects empty versions', async () => {
    const app = createApp();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492610000097', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const accept = await request(app, 'POST', '/api/auth/legal-accept', token, {
      terms_version: '',
      privacy_version: '1.0.0',
    });
    // Elysia body schema or service ValidationError
    expect(accept.status === 400 || accept.status === 422).toBe(true);
  });

  afterAll(async () => {
    await db.delete(users);
  });
});
