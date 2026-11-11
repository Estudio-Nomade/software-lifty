process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { pushTokens, users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';
import { MAX_NATIVE_TOKENS_PER_USER } from './service';
let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(pushTokens);
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

async function registerUser(): Promise<string> {
  const phone = '+5492618888888';
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Notifications', () => {
  test('POST /token registers push token', async () => {
    const accessToken = await registerUser();

    const { status, data } = await request(
      'POST',
      '/api/notifications/token',
      { token: 'ExponentPushToken[abc123]', platform: 'ios' },
      accessToken,
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Token registered');

    const db = getDb();
    const [entry] = await db.select().from(pushTokens).limit(1);
    expect(entry).toBeDefined();
    expect(entry.token).toBe('ExponentPushToken[abc123]');
    expect(entry.platform).toBe('ios');
  });

  test('POST /token without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/notifications/token', {
      token: 'ExponentPushToken[abc123]',
    });

    expect(status).toBe(401);
    expect(data.error).toMatchObject({
      code: expect.stringMatching(/TOKEN_|UNAUTHORIZED/),
      message: expect.any(String),
      status: 401,
    });
  });

  test('POST /token keeps a second device token', async () => {
    const accessToken = await registerUser();

    await request(
      'POST',
      '/api/notifications/token',
      { token: 'ExponentPushToken[old]', platform: 'android' },
      accessToken,
    );

    const { status, data } = await request(
      'POST',
      '/api/notifications/token',
      { token: 'ExponentPushToken[new]', platform: 'ios' },
      accessToken,
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Token registered');

    // Multi-device: a different token for the same (user, app) is a second device.
    const db = getDb();
    const entries = await db.select().from(pushTokens);
    expect(entries.map((e) => e.token).sort()).toEqual(['ExponentPushToken[new]', 'ExponentPushToken[old]']);
  });

  test('DELETE /token removes token', async () => {
    const accessToken = await registerUser();

    await request(
      'POST',
      '/api/notifications/token',
      { token: 'ExponentPushToken[abc123]' },
      accessToken,
    );

    const { status, data } = await request(
      'DELETE',
      '/api/notifications/token',
      undefined,
      accessToken,
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Token removed');

    const db = getDb();
    const entries = await db.select().from(pushTokens);
    expect(entries).toHaveLength(0);
  });

  test('DELETE /token without auth returns 401', async () => {
    const { status, data } = await request('DELETE', '/api/notifications/token');

    expect(status).toBe(401);
    expect(data.error).toMatchObject({
      code: expect.stringMatching(/TOKEN_|UNAUTHORIZED/),
      message: expect.any(String),
      status: 401,
    });
  });

  test('DELETE /token when no token exists returns success', async () => {
    const accessToken = await registerUser();

    const { status, data } = await request(
      'DELETE',
      '/api/notifications/token',
      undefined,
      accessToken,
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Token removed');
  });

  test('registers tokens per app: driver and passenger do not overwrite each other', async () => {
    const accessToken = await registerUser();
    const post = (token: string, app?: string) =>
      request('POST', '/api/notifications/token', { token, platform: 'android', app }, accessToken);

    await post('ExponentPushToken[driver]', 'driver');
    await post('ExponentPushToken[pass]', 'passenger');

    const rows = await getDb().select().from(pushTokens);
    expect(rows.map((r) => `${r.app}:${r.token}`).sort()).toEqual([
      'driver:ExponentPushToken[driver]',
      'passenger:ExponentPushToken[pass]',
    ]);
  });

  test('re-registering same (user, app, token) is idempotent', async () => {
    const accessToken = await registerUser();
    for (let i = 0; i < 2; i++) {
      const { status } = await request(
        'POST',
        '/api/notifications/token',
        { token: 'ExponentPushToken[a]', platform: 'ios', app: 'driver' },
        accessToken,
      );
      expect(status).toBe(200);
    }
    expect(await getDb().select().from(pushTokens)).toHaveLength(1);
  });

  test('missing app is stored as legacy', async () => {
    const accessToken = await registerUser();
    await request('POST', '/api/notifications/token', { token: 'ExponentPushToken[legacy]' }, accessToken);
    const [row] = await getDb().select().from(pushTokens);
    expect(row.app).toBe('legacy');
  });

  test('explicit app registration replaces the legacy row for the same token', async () => {
    const accessToken = await registerUser();
    await request('POST', '/api/notifications/token', { token: 'ExponentPushToken[x]' }, accessToken);
    await request('POST', '/api/notifications/token', { token: 'ExponentPushToken[x]', app: 'driver' }, accessToken);
    const rows = await getDb().select().from(pushTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0].app).toBe('driver');
  });

  test('token is reassigned when another user registers the same device token', async () => {
    const db = getDb();
    const [a] = await db.insert(users).values({ phone: '+5492610000001', full_name: 'A', role: 'driver' }).returning({ id: users.id });
    const [b] = await db.insert(users).values({ phone: '+5492610000002', full_name: 'B', role: 'passenger' }).returning({ id: users.id });
    const tokA = await createTestToken(a.id);
    const tokB = await createTestToken(b.id);

    await request('POST', '/api/notifications/token', { token: 'ExponentPushToken[shared]', app: 'driver' }, tokA);
    await request('POST', '/api/notifications/token', { token: 'ExponentPushToken[shared]', app: 'driver' }, tokB);

    const rows = await db.select().from(pushTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(b.id);
  });

  test('registering does not overwrite the admin web push row', async () => {
    const accessToken = await registerUser();
    const db = getDb();
    const [u] = await db.select({ id: users.id }).from(users).limit(1);
    await db.insert(pushTokens).values({
      user_id: u.id,
      token: 'https://push.example/endpoint',
      platform: 'web',
      web_p256dh: 'k',
      web_auth: 'a',
    });

    await request('POST', '/api/notifications/token', { token: 'ExponentPushToken[m]', platform: 'android', app: 'driver' }, accessToken);

    const rows = await db.select().from(pushTokens);
    const web = rows.find((r) => r.platform === 'web');
    expect(web?.token).toBe('https://push.example/endpoint');
    expect(web?.web_p256dh).toBe('k');
    expect(rows).toHaveLength(2);
  });

  test('DELETE /token?token= removes only that device token and never web rows', async () => {
    const accessToken = await registerUser();
    const db = getDb();
    const [u] = await db.select({ id: users.id }).from(users).limit(1);
    await db.insert(pushTokens).values({ user_id: u.id, token: 'https://push.example/e', platform: 'web' });
    await request('POST', '/api/notifications/token', { token: 'ExponentPushToken[1]', app: 'driver' }, accessToken);
    await request('POST', '/api/notifications/token', { token: 'ExponentPushToken[2]', app: 'driver' }, accessToken);

    const { status } = await request(
      'DELETE',
      '/api/notifications/token?token=ExponentPushToken%5B1%5D',
      undefined,
      accessToken,
    );
    expect(status).toBe(200);

    const rows = await db.select().from(pushTokens);
    expect(rows.map((r) => r.token).sort()).toEqual(['ExponentPushToken[2]', 'https://push.example/e']);
  });

  test('DELETE /token without query keeps web rows', async () => {
    const accessToken = await registerUser();
    const db = getDb();
    const [u] = await db.select({ id: users.id }).from(users).limit(1);
    await db.insert(pushTokens).values({ user_id: u.id, token: 'https://push.example/e', platform: 'web' });
    await request('POST', '/api/notifications/token', { token: 'ExponentPushToken[1]', app: 'driver' }, accessToken);
    await request('DELETE', '/api/notifications/token', undefined, accessToken);
    const rows = await db.select().from(pushTokens);
    expect(rows.map((r) => r.platform)).toEqual(['web']);
  });

  test('rejects tokens that are not Expo push tokens', async () => {
    const accessToken = await registerUser();
    for (const token of ['fcm-native-token', 'https://evil.example/x', 'ExponentPushToken[]', '']) {
      const { status } = await request('POST', '/api/notifications/token', { token }, accessToken);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    }
    expect(await getDb().select().from(pushTokens)).toHaveLength(0);
  });

  test('accepts legacy ExpoPushToken[...] format', async () => {
    const accessToken = await registerUser();
    const { status } = await request(
      'POST',
      '/api/notifications/token',
      { token: 'ExpoPushToken[legacy-format]' },
      accessToken,
    );
    expect(status).toBe(200);
  });

  test('rejects an unknown platform', async () => {
    const accessToken = await registerUser();
    for (const platform of ['web', 'windows', 'x'.repeat(30)]) {
      const { status } = await request(
        'POST',
        '/api/notifications/token',
        { token: 'ExponentPushToken[p]', platform },
        accessToken,
      );
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    }
  });

  test('caps native tokens per user keeping the newest', async () => {
    const accessToken = await registerUser();
    for (let i = 0; i < MAX_NATIVE_TOKENS_PER_USER + 3; i++) {
      await request(
        'POST',
        '/api/notifications/token',
        { token: `ExponentPushToken[dev${i}]`, app: 'driver' },
        accessToken,
      );
    }
    const rows = await getDb().select().from(pushTokens);
    expect(rows).toHaveLength(MAX_NATIVE_TOKENS_PER_USER);
    const tokens = rows.map((r) => r.token);
    expect(tokens).toContain(`ExponentPushToken[dev${MAX_NATIVE_TOKENS_PER_USER + 2}]`);
    expect(tokens).not.toContain('ExponentPushToken[dev0]');
  });

  test('token cap does not count or delete web subscriptions', async () => {
    const accessToken = await registerUser();
    const db = getDb();
    const [u] = await db.select({ id: users.id }).from(users).limit(1);
    await db.insert(pushTokens).values({ user_id: u.id, token: 'https://push.example/w', platform: 'web' });
    for (let i = 0; i < MAX_NATIVE_TOKENS_PER_USER + 2; i++) {
      await request('POST', '/api/notifications/token', { token: `ExponentPushToken[w${i}]` }, accessToken);
    }
    const rows = await db.select().from(pushTokens);
    expect(rows.filter((r) => r.platform === 'web')).toHaveLength(1);
    expect(rows.filter((r) => r.platform !== 'web')).toHaveLength(MAX_NATIVE_TOKENS_PER_USER);
  });
});
