process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { getDb, resetDb } from '../db/client';
import { users } from '../db/schema';
import { createTestToken } from '../testing/utils';
import { authPlugin } from './auth';
import { authGuard } from './require-auth';

const protectedRoutes = new Elysia()
  .use(authGuard)
  .get('/protected', ({ user }) => ({ id: user.id }), { requireAuth: true });

const app = new Elysia().use(authPlugin).group('/api', (a) => a.use(protectedRoutes));

async function makeRequest(headers: Record<string, string> = {}) {
  const req = new Request('http://localhost/api/protected', { method: 'GET', headers });
  const res = await app.handle(req);
  return { status: res.status, data: await res.json() };
}

describe('requireAuth macro', () => {
  const db = getDb();

  beforeAll(async () => {
    await db.delete(users);
  });

  beforeEach(async () => {
    await db.delete(users);
  });

  afterAll(async () => {
    await db.delete(users);
    resetDb();
  });

  test('401 TOKEN_REQUIRED when no authorization header', async () => {
    const { status, data } = await makeRequest();
    expect(status).toBe(401);
    expect(data.error).toEqual({
      code: 'TOKEN_REQUIRED',
      message: 'Se requiere iniciar sesión.',
      status: 401,
    });
    expect(data.meta?.timestamp).toBeString();
  });

  test('401 TOKEN_REQUIRED with malformed token', async () => {
    const { status, data } = await makeRequest({ Authorization: 'Bearer not.a.real.jwt' });
    expect(status).toBe(401);
    expect(data.error.code).toBe('TOKEN_REQUIRED');
    expect(data.error.status).toBe(401);
    expect(data.meta?.timestamp).toBeString();
  });

  test('401 TOKEN_REQUIRED with non-existent user token', async () => {
    const { status, data } = await makeRequest({ Authorization: 'Bearer non-existent-user' });
    expect(status).toBe(401);
    expect(data.error.code).toBe('TOKEN_REQUIRED');
    expect(data.error.status).toBe(401);
  });
  test('200 with narrowed user for a valid token', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492610000002', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const { status, data } = await makeRequest({ Authorization: `Bearer ${token}` });
    expect(status).toBe(200);
    expect(data.id).toBe(user.id);
  });
});
