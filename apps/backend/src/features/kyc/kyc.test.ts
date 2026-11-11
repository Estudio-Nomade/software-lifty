process.env.NODE_ENV = 'test';
process.env.DIDIT_ALLOW_UNSIGNED_WEBHOOKS = '1';
// bun auto-loads .env; the legacy-signature tests need the secret unset.
delete process.env.DIDIT_WEBHOOK_SECRET;
delete process.env.DIDIT_ENV;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { createApp } from '../../index';
import { canonicalize, createSession, getDiditEnv, verifyWebhookSignature } from '../../shared/lib/didit';
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
    { first_name: 'Test Driver', address_line: 'San Martín 100, Villa Dolores, Córdoba', photo_url: 'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png' },
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
    expect(data.error).toMatchObject({
      code: expect.stringMatching(/TOKEN_|UNAUTHORIZED/),
      message: expect.any(String),
      status: 401,
    });
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

describe('KYC single source of truth + verified name lock', () => {
  async function approvedUser(phone: string) {
    const { token, userId } = await registerAndGetTokenAndUser(phone, 'x');
    const db = getDb();
    await db
      .update(users)
      .set({ kyc_status: 'approved', verified_name: 'Juan Pérez Verificado', full_name: 'Juan Pérez' })
      .where(eq(users.id, userId));
    return { token, userId };
  }

  test('GET /me/session does not reset an already approved KYC (users + drivers)', async () => {
    const { token, userId } = await approvedUser('+5492613000001');
    const db = getDb();
    await db.insert(drivers).values({ user_id: userId, status: 'kyc_approved', kyc_status: 'approved' });

    const { status, data } = await request('GET', '/api/kyc/me/session', undefined, token);

    expect(status).toBe(200);
    expect(data.already_verified).toBe(true);
    expect(data.kyc_status).toBe('approved');
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    const [d] = await db.select().from(drivers).where(eq(drivers.user_id, userId));
    expect(u.kyc_status).toBe('approved');
    expect(d.kyc_status).toBe('approved');
  });

  test('GET /me/session heals a drifted drivers.kyc_status when users is approved', async () => {
    const { token, userId } = await approvedUser('+5492613000002');
    const db = getDb();
    await db.insert(drivers).values({ user_id: userId, status: 'step1', kyc_status: 'pending' });

    await request('GET', '/api/kyc/me/session', undefined, token);

    const [d] = await db.select().from(drivers).where(eq(drivers.user_id, userId));
    expect(d.kyc_status).toBe('approved');
  });

  test('GET /me/session still resets a non-approved status to pending and returns a session', async () => {
    const { token, userId } = await registerAndGetTokenAndUser('+5492613000003', 'x');
    const db = getDb();
    await db.update(users).set({ kyc_status: 'rejected' }).where(eq(users.id, userId));

    const { status, data } = await request('GET', '/api/kyc/me/session', undefined, token);

    expect(status).toBe(200);
    expect(data.session_url).toBeTruthy();
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u.kyc_status).toBe('pending');
  });

  test('new driver row inherits users.kyc_status when person is already verified', async () => {
    const { token, userId } = await approvedUser('+5492613000004');

    const { status } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Juan',
        address_line: 'San Martín 100, Villa Dolores, Córdoba',
        photo_url:
          'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
      },
      token,
    );

    expect(status).toBe(200);
    const [d] = await getDb().select().from(drivers).where(eq(drivers.user_id, userId));
    expect(d.kyc_status).toBe('approved');
  });

  test('driver onboarding does not overwrite a KYC-verified full_name', async () => {
    const { token, userId } = await approvedUser('+5492613000005');

    await request(
      'PUT',
      '/api/drivers/me',
      { first_name: 'Otro', last_name: 'Nombre', address_line: 'San Martín 100, Villa Dolores, Córdoba' },
      token,
    );

    const [u] = await getDb().select().from(users).where(eq(users.id, userId));
    expect(u.full_name).toBe('Juan Pérez');
  });

  test('passenger register/updateProfile do not overwrite a KYC-verified full_name', async () => {
    const { token, userId } = await approvedUser('+5492613000006');

    await request('POST', '/api/passenger/register', { full_name: 'Alias Uno' }, token);
    await request('PUT', '/api/passenger/profile', { full_name: 'Alias Dos' }, token);

    const [u] = await getDb().select().from(users).where(eq(users.id, userId));
    expect(u.full_name).toBe('Juan Pérez');
  });

  test('full_name is still editable when KYC is not approved', async () => {
    const { token, userId } = await registerAndGetTokenAndUser('+5492613000007', 'x');

    await request('PUT', '/api/passenger/profile', { full_name: 'Nuevo Nombre' }, token);

    const [u] = await getDb().select().from(users).where(eq(users.id, userId));
    expect(u.full_name).toBe('Nuevo Nombre');
  });
});


describe('Didit webhook signature (V2)', () => {
  const SECRET = 'test-secret';
  const body = { status: 'Approved', vendor_data: 'u-1', score: 1.0, name: 'José', b: 1, a: { z: 1, y: [2, 1] } };
  const sign = (data: string) => createHmac('sha256', SECRET).update(data).digest('hex');
  const raw = JSON.stringify(body);

  beforeEach(() => {
    process.env.DIDIT_WEBHOOK_SECRET = SECRET;
  });
  afterAll(() => {
    delete process.env.DIDIT_WEBHOOK_SECRET;
  });

  test('canonicalize sorts keys, is compact and keeps unicode', () => {
    expect(canonicalize(body)).toBe('{"a":{"y":[2,1],"z":1},"b":1,"name":"José","score":1,"status":"Approved","vendor_data":"u-1"}');
  });

  test('accepts a valid X-Signature-V2', () => {
    const headers = new Headers({ 'X-Signature-V2': sign(canonicalize(body)) });
    expect(verifyWebhookSignature({ rawBody: raw, parsedBody: body, headers })).toBe(true);
  });

  test('accepts a valid raw X-Signature', () => {
    const headers = new Headers({ 'X-Signature': sign(raw) });
    expect(verifyWebhookSignature({ rawBody: raw, parsedBody: body, headers })).toBe(true);
  });

  test('rejects a tampered body and a bad signature', () => {
    const headers = new Headers({ 'X-Signature-V2': sign(canonicalize(body)) });
    expect(verifyWebhookSignature({ rawBody: raw, parsedBody: { ...body, status: 'Declined' }, headers })).toBe(false);
    expect(verifyWebhookSignature({ rawBody: raw, parsedBody: body, headers: new Headers({ 'X-Signature-V2': 'deadbeef' }) })).toBe(false);
    expect(verifyWebhookSignature({ rawBody: raw, parsedBody: body, headers: new Headers() })).toBe(false);
  });

  test('webhook route: 401 on bad signature, ignores environment mismatch', async () => {
    app = createApp(createTestAuthPlugin());
    const payload = { status: 'Approved', vendor_data: 'x', environment: 'sandbox' };
    const post = async (headers: Record<string, string>) => {
      const res = await app.handle(
        new Request('http://localhost/api/kyc/webhook/didit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...webhookHeaders(), ...headers },
          body: JSON.stringify(payload),
        }),
      );
      return { status: res.status, data: await res.json() };
    };
    expect((await post({ 'X-Signature-V2': 'deadbeef' })).status).toBe(401);
    const ok = await post({ 'X-Signature-V2': sign(canonicalize(payload)) });
    expect(ok.status).toBe(200); // DIDIT_ENV unset => live => sandbox event ignored
    expect(ok.data.message).toContain('Ignored');
  });
});

describe('Didit createSession sandbox_scenario', () => {
  test('sends sandbox_scenario only when DIDIT_ENV=sandbox', async () => {
    const realFetch = globalThis.fetch;
    const bodies: any[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ session_id: 's', session_token: 't', url: 'u' }), { status: 200 });
    }) as any;
    const prev = { ...process.env };
    process.env.NODE_ENV = 'development';
    process.env.DIDIT_API_KEY = 'k';
    process.env.DIDIT_WORKFLOW_ID = 'w';
    process.env.DIDIT_SANDBOX_SCENARIO = 'approve';
    try {
      process.env.DIDIT_ENV = 'live';
      await createSession('u1');
      process.env.DIDIT_ENV = 'sandbox';
      await createSession('u1');
    } finally {
      globalThis.fetch = realFetch;
      process.env.NODE_ENV = 'test';
      for (const k of ['DIDIT_API_KEY', 'DIDIT_WORKFLOW_ID', 'DIDIT_SANDBOX_SCENARIO', 'DIDIT_ENV']) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
    expect(bodies[0].sandbox_scenario).toBeUndefined();
    expect(bodies[1].sandbox_scenario).toBe('approve');
  });
});


describe('Didit hardening', () => {
  test('rejects hex signature with trailing garbage', () => {
    process.env.DIDIT_WEBHOOK_SECRET = 'k';
    const b = { a: 1 };
    const good = createHmac('sha256', 'k').update(canonicalize(b)).digest('hex');
    const headers = new Headers({ 'X-Signature-V2': `${good}zz` });
    expect(verifyWebhookSignature({ rawBody: '{"a":1}', parsedBody: b, headers })).toBe(false);
    delete process.env.DIDIT_WEBHOOK_SECRET;
  });

  test('unsigned shortcut needs the explicit flag; otherwise secret-missing throws', () => {
    delete process.env.DIDIT_ALLOW_UNSIGNED_WEBHOOKS;
    const headers = new Headers({ 'X-Signature-V2': 'anything' });
    expect(() => verifyWebhookSignature({ rawBody: '{}', parsedBody: {}, headers })).toThrow();
    process.env.DIDIT_ALLOW_UNSIGNED_WEBHOOKS = '1';
  });

  test('invalid DIDIT_ENV throws instead of falling back to live', () => {
    process.env.DIDIT_ENV = 'production';
    expect(() => getDiditEnv()).toThrow(/Invalid DIDIT_ENV/);
    delete process.env.DIDIT_ENV;
  });
});
