process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { driverDocuments, drivers, users, vehicles } from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(driverDocuments);
  await db.delete(vehicles);
  await db.delete(drivers);
  await db.delete(users);
}

async function request(
  method: string,
  path: string,
  body?: object,
  token?: string,
  extraHeaders?: Record<string, string>,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (extraHeaders) Object.assign(headers, extraHeaders);
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const data = await res.json();
  return { status: res.status, data };
}

function webhookHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-Timestamp': String(Math.floor(Date.now() / 1000)), ...extra };
}

async function registerAndGetTokenAndUser(phone: string, _password: string): Promise<{ token: string; userId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  const token = await createTestToken(user.id);
  return { token, userId: user.id };
}

async function createDriver(token: string): Promise<string> {
  const { data } = await request(
    'PUT',
    '/api/drivers/me',
    { first_name: 'Test Driver', address_line: 'San Martín 100, Villa Dolores, Córdoba' },
    token,
  );
  return data.id;
}

beforeAll(() => {
  app = createApp(createTestAuthPlugin());
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('KYC', () => {
  const phone = '+5492612222222';
  const password = 'testPass123';

  test('GET /session/id returns session token', async () => {
    const { token } = await registerAndGetTokenAndUser(phone, password);
    const driverId = await createDriver(token);

    const { status, data } = await request('GET', `/api/kyc/session/${driverId}`, undefined, token);

    expect(status).toBe(200);
    expect(data.session_token).toBeString();
    expect(data.session_token).toContain('mock-session');
    expect(data.session_url).toBeString();
  });

  test('GET /session/id without auth returns 401', async () => {
    const { token } = await registerAndGetTokenAndUser(phone, password);
    const driverId = await createDriver(token);

    const { status, data } = await request('GET', `/api/kyc/session/${driverId}`);

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test("GET /session/id for different user's driver returns error", async () => {
    const { token: tokenA } = await registerAndGetTokenAndUser(phone, password);
    const driverIdA = await createDriver(tokenA);

    const { token: tokenB } = await registerAndGetTokenAndUser('+5492613333333', password);

    const { status, data } = await request(
      'GET',
      `/api/kyc/session/${driverIdA}`,
      undefined,
      tokenB,
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('NOT_FOUND');
    expect(data.error.message).toBe('Driver not found or does not belong to you');
  });

  test('POST /webhook updates user kyc status to in_progress', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'in_progress' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid' }),
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Webhook processed');

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(user!.kyc_status).toBe('in_progress');

    const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, userId)).limit(1);
    expect(driver!.kyc_status).toBe('in_progress');
  });

  test('POST /webhook with approved status updates user and driver', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    const driverId = await createDriver(token);

    await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'in_progress' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid' }),
    );

    await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'under_review' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid' }),
    );

    const { status } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      {
        vendor_data: userId,
        status: 'approved',
        full_name: 'Juan Perez',
        document_number: '35678901',
      },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid' }),
    );

    expect(status).toBe(200);

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(user!.kyc_status).toBe('approved');
    expect(user!.verified_name).toBe('Juan Perez');
    expect(user!.verified_document_hash).toBeString();
    expect(user!.document_number_last4).toBe('8901');

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(driver!.kyc_status).toBe('approved');
    // KYC approval verifies identity but must NOT approve the driver: they still
    // owe the vehicle + documents steps and admin review.
    expect(driver!.status).toBe('kyc_approved');
  });

  test('POST /webhook with invalid HMAC returns error', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'in_progress' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'invalid' }),
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(data.message).toBe('Invalid HMAC signature');
  });

  test('POST /webhook with invalid status returns error', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'bogus' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid' }),
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toBe('Invalid status: bogus');
  });

  test('POST /webhook rejects transition from approved back to pending', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const db = getDb();
    await db.update(users).set({ kyc_status: 'approved' }).where(eq(users.id, userId));

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'pending' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid' }),
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toBe('Invalid status transition from approved to pending');
  });

  test('POST /webhook without signature header returns 401', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'in_progress' },
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(data.message).toBe('Missing X-Timestamp header');
  });

  test('POST /webhook with empty signature header returns 401', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'in_progress' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': '' }),
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(data.message).toBe('Invalid HMAC signature');
  });

  test('POST /webhook with malformed JSON body returns 400', async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Didit-Signature': 'valid',
    };
    const req = new Request('http://localhost/api/kyc/webhook/didit', {
      method: 'POST',
      headers,
      body: 'not-json{{{',
    });
    const res = await app.handle(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('Bad Request');
    expect(data.message).toBe('Invalid JSON body');
  });

  test('POST /webhook with missing vendor_data returns 400', async () => {
    const { token } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { status: 'in_progress' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid' }),
    );

    expect(status).toBe(400);
    expect(data.error).toBe('Bad Request');
    expect(data.message).toBe('userId and status are required');
  });

  test('POST /webhook with non-existent user returns 404', async () => {
    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: '00000000-0000-0000-0000-000000000000', status: 'approved' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid' }),
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('NOT_FOUND');
    expect(data.error.message).toBe('User not found');
  });

  test('POST /webhook with rejected status updates user and driver', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'rejected' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid' }),
    );

    expect(status).toBe(200);

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(user!.kyc_status).toBe('rejected');

    const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, userId)).limit(1);
    expect(driver!.kyc_status).toBe('rejected');
  });

  test('POST /webhook maps DIDIT Declined label to rejected', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'Declined' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid' }),
    );

    expect(status).toBe(200);

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(user!.kyc_status).toBe('rejected');
  });

  test('POST /webhook with X-Signature header variant accepts valid signature', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'in_progress' },
      undefined,
      webhookHeaders({ 'X-Signature': 'valid' }),
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Webhook processed');
  });

  test('POST /webhook with X-Signature-V2 header variant accepts valid signature', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'in_progress' },
      undefined,
      webhookHeaders({ 'X-Signature-V2': 'valid' }),
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Webhook processed');
  });

  test('POST /webhook without X-Timestamp header returns 401', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'in_progress' },
      undefined,
      { 'X-Didit-Signature': 'valid' },
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(data.message).toBe('Missing X-Timestamp header');
  });

  test('POST /webhook with expired X-Timestamp returns 401', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const expiredTs = String(Math.floor(Date.now() / 1000) - 600);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'in_progress' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid', 'X-Timestamp': expiredTs }),
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(data.message).toBe('Timestamp expired');
  });

  test('POST /webhook with timestamp within window processes normally', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await createDriver(token);

    const recentTs = String(Math.floor(Date.now() / 1000) - 60);

    const { status, data } = await request(
      'POST',
      '/api/kyc/webhook/didit',
      { vendor_data: userId, status: 'in_progress' },
      undefined,
      webhookHeaders({ 'X-Didit-Signature': 'valid', 'X-Timestamp': recentTs }),
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Webhook processed');
  });
});
