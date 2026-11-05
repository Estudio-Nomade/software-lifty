process.env.NODE_ENV = 'test';
process.env.SEND_PUSH_IN_DEV = 'true';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { getDb, resetDb } from '../db/client';
import { pushTokens, users } from '../db/schema';
import { logger } from './logger';
import { sendPushToUserDetailed } from './push';

type Sent = { to: string; body: Record<string, unknown> };
const realFetch = globalThis.fetch;
let sent: Sent[] = [];
let responder: (to: string, attempt: number) => { status: number; json: unknown } | 'throw';
let attempts: Record<string, number> = {};
let userId = '';

function installFetch() {
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push({ to: body.to, body });
    attempts[body.to] = (attempts[body.to] ?? 0) + 1;
    const r = responder(body.to, attempts[body.to]);
    if (r === 'throw') throw new Error('network down');
    return new Response(JSON.stringify(r.json), { status: r.status });
  }) as unknown as typeof fetch;
}

const ok = { status: 200, json: { data: { status: 'ok', id: 'x' } } };

beforeEach(async () => {
  const db = getDb();
  await db.delete(pushTokens);
  await db.delete(users);
  const [u] = await db
    .insert(users)
    .values({ phone: '+5492619999999', full_name: 'P', role: 'both' })
    .returning({ id: users.id });
  userId = u.id;
  sent = [];
  attempts = {};
  responder = () => ok;
  installFetch();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(async () => {
  await getDb().delete(pushTokens);
  await getDb().delete(users);
  resetDb();
});

async function seed(rows: Array<{ token: string; app: string; platform?: string }>) {
  await getDb()
    .insert(pushTokens)
    .values(rows.map((r) => ({ user_id: userId, platform: 'android', ...r })));
}

const msg = { title: 't', body: 'b' };

describe('sendPushToUserDetailed', () => {
  test('filters by destination app and includes legacy rows', async () => {
    await seed([
      { token: 'ExponentPushToken[d]', app: 'driver' },
      { token: 'ExponentPushToken[p]', app: 'passenger' },
      { token: 'ExponentPushToken[l]', app: 'legacy' },
    ]);
    const res = await sendPushToUserDetailed(userId, { ...msg, app: 'driver' });
    expect(res.status).toBe('sent');
    expect(sent.map((s) => s.to).sort()).toEqual(['ExponentPushToken[d]', 'ExponentPushToken[l]']);
  });

  test('message without app goes to every app', async () => {
    await seed([
      { token: 'ExponentPushToken[d]', app: 'driver' },
      { token: 'ExponentPushToken[p]', app: 'passenger' },
    ]);
    await sendPushToUserDetailed(userId, msg);
    expect(sent).toHaveLength(2);
  });

  test('never sends to web subscriptions', async () => {
    await seed([{ token: 'https://push/e', app: 'legacy', platform: 'web' }]);
    const res = await sendPushToUserDetailed(userId, { ...msg, app: 'driver' });
    expect(res.status).toBe('zero_tokens');
    expect(sent).toHaveLength(0);
  });

  test('DeviceNotRegistered (single-object response) deletes the token', async () => {
    await seed([
      { token: 'ExponentPushToken[dead]', app: 'driver' },
      { token: 'ExponentPushToken[live]', app: 'driver' },
    ]);
    responder = (to) =>
      to.includes('dead')
        ? {
            status: 200,
            json: { data: { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } } },
          }
        : ok;
    const res = await sendPushToUserDetailed(userId, { ...msg, app: 'driver' });
    expect(res.ok).toBe(true);
    const left = await getDb().select().from(pushTokens);
    expect(left.map((r) => r.token)).toEqual(['ExponentPushToken[live]']);
  });

  test('DeviceNotRegistered (array response) deletes the token', async () => {
    await seed([{ token: 'ExponentPushToken[dead]', app: 'driver' }]);
    responder = () => ({
      status: 200,
      json: { data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] },
    });
    const res = await sendPushToUserDetailed(userId, { ...msg, app: 'driver' });
    expect(res.status).toBe('failed');
    expect(await getDb().select().from(pushTokens)).toHaveLength(0);
  });

  test('other errors keep the token', async () => {
    await seed([{ token: 'ExponentPushToken[a]', app: 'driver' }]);
    responder = () => ({
      status: 200,
      json: { data: { status: 'error', details: { error: 'MessageRateExceeded' } } },
    });
    const res = await sendPushToUserDetailed(userId, { ...msg, app: 'driver' });
    expect(res.status).toBe('failed');
    expect(await getDb().select().from(pushTokens)).toHaveLength(1);
  });

  test('forwards ttl to Expo', async () => {
    await seed([{ token: 'ExponentPushToken[a]', app: 'driver' }]);
    await sendPushToUserDetailed(userId, { ...msg, app: 'driver', ttl: 30 });
    expect(sent[0].body.ttl).toBe(30);
  });

  test('retries once on 5xx and then succeeds', async () => {
    await seed([{ token: 'ExponentPushToken[a]', app: 'driver' }]);
    responder = (_to, attempt) => (attempt === 1 ? { status: 503, json: {} } : ok);
    const res = await sendPushToUserDetailed(userId, { ...msg, app: 'driver' });
    expect(res.ok).toBe(true);
    expect(sent).toHaveLength(2);
  });

  test('retries once on network error and gives up after the second failure', async () => {
    await seed([{ token: 'ExponentPushToken[a]', app: 'driver' }]);
    responder = () => 'throw';
    const res = await sendPushToUserDetailed(userId, { ...msg, app: 'driver' });
    expect(res.status).toBe('failed');
    expect(sent).toHaveLength(2);
    expect(await getDb().select().from(pushTokens)).toHaveLength(1);
  });

  test('one failing token does not block the others', async () => {
    await seed([
      { token: 'ExponentPushToken[bad]', app: 'driver' },
      { token: 'ExponentPushToken[good]', app: 'driver' },
    ]);
    responder = (to) => (to.includes('bad') ? 'throw' : ok);
    const res = await sendPushToUserDetailed(userId, { ...msg, app: 'driver' });
    expect(res.ok).toBe(true);
    expect(sent.some((s) => s.to.includes('good'))).toBe(true);
  });

  test('drops unsupported non-Expo tokens without calling any provider', async () => {
    await seed([
      { token: 'fcm-native-legacy-token', app: 'legacy' },
      { token: 'ExponentPushToken[ok]', app: 'driver' },
    ]);
    const res = await sendPushToUserDetailed(userId, { ...msg, app: 'driver' });
    expect(res.ok).toBe(true);
    expect(sent.map((s) => s.to)).toEqual(['ExponentPushToken[ok]']);
    const left = await getDb().select().from(pushTokens);
    expect(left.map((r) => r.token)).toEqual(['ExponentPushToken[ok]']);
  });

  test('never logs the full push token', async () => {
    const full = 'ExponentPushToken[SECRET-DEVICE-TOKEN-1234567890]';
    await seed([{ token: full, app: 'driver' }]);
    responder = () => ({
      status: 200,
      json: { data: { status: 'error', details: { error: 'DeviceNotRegistered' } } },
    });
    const spies = (['info', 'warn', 'error', 'debug'] as const).map((l) =>
      spyOn(logger, l as 'info'),
    );
    await sendPushToUserDetailed(userId, { ...msg, app: 'driver' });
    const logged = JSON.stringify(spies.flatMap((sp) => sp.mock.calls));
    for (const sp of spies) sp.mockRestore();
    expect(logged).not.toContain('SECRET-DEVICE-TOKEN-1234567890');
    expect(logged).toContain('ExponentPushToken[');
  });
});
