process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { drivers, payoutMethods, users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(payoutMethods);
  await db.delete(drivers);
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

async function registerAndGetToken(): Promise<{ token: string; userId: string }> {
  const phone = `+549261${Math.floor(1000000 + Math.random() * 9000000)}`;
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  return { token: await createTestToken(user.id), userId: user.id };
}

async function createDriverRow(userId: string): Promise<string> {
  const db = getDb();
  const [driver] = await db
    .insert(drivers)
    .values({ user_id: userId })
    .returning({ id: drivers.id });
  return driver.id;
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

describe('Payment Methods', () => {
  test('POST creates payment method', async () => {
    const { token, userId } = await registerAndGetToken();
    await createDriverRow(userId);

    const { status, data } = await request(
      'POST',
      '/api/drivers/me/payment-methods',
      {
        method_type: 'cvu',
        account_number: '1234567890123456789012',
        titular_name: 'Test Driver',
        wallet: 'MercadoPago',
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.id).toBeString();
    expect(data.method_type).toBe('cvu');
    expect(data.account_number).toBe('1234567890123456789012');
    expect(data.message).toBe('Payment method added');
  });

  test('POST without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/drivers/me/payment-methods', {
      method_type: 'cvu',
      account_number: '1234567890123456789012',
    });

    expect(status).toBe(401);
    expect(data.error).toMatchObject({
      code: expect.stringMatching(/TOKEN_|UNAUTHORIZED/),
      message: expect.any(String),
      status: 401,
    });
  });

  test('GET returns payment methods list', async () => {
    const { token, userId } = await registerAndGetToken();
    await createDriverRow(userId);

    await request(
      'POST',
      '/api/drivers/me/payment-methods',
      { method_type: 'cvu', account_number: '1111111111111111111111' },
      token,
    );
    await request(
      'POST',
      '/api/drivers/me/payment-methods',
      { method_type: 'alias', account_number: 'mi.alias.mp', wallet: 'MercadoPago' },
      token,
    );

    const { status, data } = await request(
      'GET',
      '/api/drivers/me/payment-methods',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    expect(data[0].method_type).toBeString();
    expect(data[0].account_number).toBeString();
    expect(data[0].created_at).toBeString();
  });

  test('DELETE removes payment method', async () => {
    const { token, userId } = await registerAndGetToken();
    await createDriverRow(userId);

    const { data: created } = await request(
      'POST',
      '/api/drivers/me/payment-methods',
      { method_type: 'cbu', account_number: '2222222222222222222222' },
      token,
    );

    const { status, data } = await request(
      'DELETE',
      `/api/drivers/me/payment-methods/${created.id}`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Payment method removed');

    const { data: list } = await request(
      'GET',
      '/api/drivers/me/payment-methods',
      undefined,
      token,
    );
    expect(list.length).toBe(0);
  });

  test('DELETE non-existent id returns error', async () => {
    const { token, userId } = await registerAndGetToken();
    await createDriverRow(userId);

    const { status, data } = await request(
      'DELETE',
      '/api/drivers/me/payment-methods/00000000-0000-0000-0000-000000000000',
      undefined,
      token,
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('NOT_FOUND');
  });

  test('POST without driver row returns error', async () => {
    const { token } = await registerAndGetToken();

    const { status, data } = await request(
      'POST',
      '/api/drivers/me/payment-methods',
      {
        method_type: 'cvu',
        account_number: '1234567890123456789012',
      },
      token,
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('NOT_FOUND');
    expect(data.error.message).toBe('Driver profile required');
  });

  test('GET without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/drivers/me/payment-methods');

    expect(status).toBe(401);
    expect(data.error).toMatchObject({
      code: expect.stringMatching(/TOKEN_|UNAUTHORIZED/),
      message: expect.any(String),
      status: 401,
    });
  });

  test('DELETE without auth returns 401', async () => {
    const { status, data } = await request(
      'DELETE',
      '/api/drivers/me/payment-methods/00000000-0000-0000-0000-000000000000',
    );

    expect(status).toBe(401);
    expect(data.error).toMatchObject({
      code: expect.stringMatching(/TOKEN_|UNAUTHORIZED/),
      message: expect.any(String),
      status: 401,
    });
  });
});
