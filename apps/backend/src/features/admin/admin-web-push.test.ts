process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
// Deterministic test-only VAPID pair (not used in production).
process.env.VAPID_PUBLIC_KEY =
  'BFk8eQtsBZOfFQ_GHSC2oIRTCAqV10ZLYPP61SiT5lfMS0wPcyDZJiwfuNwLcg4fv6rXUEoPoxe8VP6OdeiQkpg';
process.env.VAPID_PRIVATE_KEY = 'OJapkmPIHzMCOjfmJWHrloxS_JhvtMK_0t9SMVZ_0fY';
process.env.SEND_WEB_PUSH_IN_DEV = 'false';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { pushTokens, users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: ReturnType<typeof createApp>;

async function truncateTables() {
  const db = getDb();
  await db.delete(pushTokens);
  await db.delete(users);
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const data = await res.json();
  return { status: res.status, data };
}

async function createAdmin(): Promise<string> {
  const db = getDb();
  const [admin] = await db
    .insert(users)
    .values({ phone: '+5492619990001', role: 'admin', email: 'admin-push@test.com' })
    .returning({ id: users.id });
  return createTestToken(admin.id);
}

async function createDriver(): Promise<string> {
  const db = getDb();
  const [u] = await db
    .insert(users)
    .values({ phone: '+5492618880001', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(u.id);
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

describe('Admin web push subscription', () => {
  test('non-admin gets 403 on subscribe', async () => {
    const token = await createDriver();
    const { status } = await request(
      'POST',
      '/api/admin/push-subscription',
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
        keys: { p256dh: 'p256', auth: 'authk' },
      },
      token,
    );
    expect(status).toBe(403);
  });

  test('admin can register and delete web subscription', async () => {
    const token = await createAdmin();
    const endpoint = 'https://fcm.googleapis.com/fcm/send/admin-endpoint-1';

    const reg = await request(
      'POST',
      '/api/admin/push-subscription',
      { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } },
      token,
    );
    expect(reg.status).toBe(200);
    expect(reg.data.message).toBe('Subscription registered');

    const db = getDb();
    const [row] = await db.select().from(pushTokens).limit(1);
    expect(row).toBeDefined();
    expect(row!.platform).toBe('web');
    expect(row!.token).toBe(endpoint);
    expect(row!.web_p256dh).toBe('p256dh-key');
    expect(row!.web_auth).toBe('auth-key');

    const del = await request(
      'DELETE',
      '/api/admin/push-subscription',
      { endpoint },
      token,
    );
    expect(del.status).toBe(200);
    const left = await db.select().from(pushTokens);
    expect(left).toHaveLength(0);
  });

  test('GET vapid-public-key requires admin', async () => {
    const driverToken = await createDriver();
    const forbidden = await request('GET', '/api/admin/push/vapid-public-key', undefined, driverToken);
    expect(forbidden.status).toBe(403);

    const adminToken = await createAdmin();
    const ok = await request('GET', '/api/admin/push/vapid-public-key', undefined, adminToken);
    // With dummy keys may still return 200 if env set
    expect([200, 503]).toContain(ok.status);
    if (ok.status === 200) {
      expect(ok.data.publicKey).toBeString();
    }
  });
});

describe('sendWebPushToAdmins', () => {
  test('returns 0 when no subscriptions', async () => {
    const { sendWebPushToAdmins } = await import('../../shared/lib/web-push');
    const n = await sendWebPushToAdmins({ title: 't', body: 'b' });
    expect(n).toBe(0);
  });

  test('skips non-admin web tokens', async () => {
    const db = getDb();
    const [driver] = await db
      .insert(users)
      .values({ phone: '+5492617770001', role: 'driver' })
      .returning({ id: users.id });
    await db.insert(pushTokens).values({
      user_id: driver.id,
      token: 'https://example.com/endpoint-driver',
      platform: 'web',
      web_p256dh: 'x',
      web_auth: 'y',
    });

    const { sendWebPushToAdmins } = await import('../../shared/lib/web-push');
    const n = await sendWebPushToAdmins({ title: 't', body: 'b' });
    expect(n).toBe(0);
  });
});
