process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
delete process.env.REDIS_URL;

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { drivers, tripEvents, trips, users } from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';

let app: any;
let testId = 0;

async function truncateTables() {
  const db = getDb();
  await db.delete(tripEvents);
  await db.delete(trips);
  await db.delete(drivers);
  await db.delete(users);
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-forwarded-for': `10.0.0.${(testId % 254) + 1}`,
  };
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

async function createDriverRow(token: string): Promise<string> {
  await request('PUT', '/api/drivers/me', { first_name: 'Test Driver' }, token);
  const db = getDb();
  const [driver] = await db.select({ id: drivers.id }).from(drivers).limit(1);
  return driver!.id;
}

async function createCompletedTrip(token: string) {
  const { data: trip } = await request(
    'POST',
    '/api/trips',
    {
      origin_lat: -31.9,
      origin_lng: -65.0,
      dest_lat: -31.88,
      dest_lng: -65.02,
      vehicle_type: 'car',
      distance_km: 5,
      duration_minutes: 15,
    },
    token,
  );

  const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
  await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
  await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);
  await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);
  await request('POST', `/api/trips/${trip.id}/complete`, undefined, token);

  return trip;
}

// ── Mocks ──────────────────────────────────────────────────────────

const getPaymentMock = mock();

mock.module('../../shared/lib/mercado-pago', () => {
  return {
    getPayment: getPaymentMock,
    createWithdrawal: mock(() => Promise.resolve({ id: 'mock-wd', amount: 500, status: 'processed' })),
    verifyWebhookSignature: mock(() => true),
  };
});

// ── Suite ──────────────────────────────────────────────────────────

describe('collectTrip with Mercado Pago', () => {
  const phone = '+5492617777777';
  const password = 'testPass123';

  beforeAll(() => {
    app = createApp(createTestAuthPlugin());
  });

  beforeEach(async () => {
    testId++;
    await truncateTables();
    getPaymentMock.mockReset();
  });

  afterAll(async () => {
    await truncateTables();
    resetDb();
  });

  // 1 ─ Cobro exitoso con MP
  test('collect with approved MP payment succeeds', async () => {
    getPaymentMock.mockResolvedValue({
      id: 'mp-test-approved',
      amount: 1500,
      status: 'approved',
      payer_email: 'test@test.com',
    });

    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);
    const trip = await createCompletedTrip(token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'mercadopago', mp_payment_id: 'mp-test-approved' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);
    expect(data.payment_method).toBe('mercadopago');

    const db = getDb();
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBe(0);

    expect(getPaymentMock).toHaveBeenCalledTimes(1);
    expect(getPaymentMock).toHaveBeenCalledWith('mp-test-approved');
  });

  // 2 ─ Cobro rechazado
  test('collect with rejected MP payment returns error', async () => {
    getPaymentMock.mockResolvedValue({
      id: 'mp-test-rejected',
      amount: 1500,
      status: 'rejected',
    });

    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const trip = await createCompletedTrip(token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'mercadopago', mp_payment_id: 'mp-test-rejected' },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('not approved: rejected');

    const db = getDb();
    const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
    expect(updated!.is_collected).toBe(false);

    expect(getPaymentMock).toHaveBeenCalledTimes(1);
  });

  // 3 ─ Pago pendiente
  test('collect with pending MP payment returns error', async () => {
    getPaymentMock.mockResolvedValue({
      id: 'mp-test-pending',
      amount: 1500,
      status: 'pending',
    });

    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const trip = await createCompletedTrip(token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'mercadopago', mp_payment_id: 'mp-test-pending' },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('not approved: pending');

    const db = getDb();
    const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
    expect(updated!.is_collected).toBe(false);
  });

  // 4 ─ Error de red / timeout de MP
  test('collect with MP network error returns error', async () => {
    getPaymentMock.mockRejectedValue(new Error('Network error: Connection timeout'));

    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const trip = await createCompletedTrip(token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'mercadopago', mp_payment_id: 'mp-test-timeout' },
      token,
    );

    expect(status).toBe(500);
    expect(data.error).toBeDefined();

    const db = getDb();
    const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
    expect(updated!.is_collected).toBe(false);
  });

  // 5 ─ Idempotencia (no cobrar dos veces)
  test('collect twice on same trip returns error on second call', async () => {
    getPaymentMock.mockResolvedValue({
      id: 'mp-test-idempotent',
      amount: 1500,
      status: 'approved',
    });

    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const trip = await createCompletedTrip(token);

    const collectBody = { payment_method: 'mercadopago', mp_payment_id: 'mp-test-idempotent' };

    const first = await request('PUT', `/api/trips/${trip.id}/collect`, collectBody, token);
    expect(first.status).toBe(200);
    expect(first.data.is_collected).toBe(true);

    const second = await request('PUT', `/api/trips/${trip.id}/collect`, collectBody, token);
    expect(second.status).toBe(400);
    expect(second.data.error.code).toBe('BAD_REQUEST');
    expect(second.data.error.message).toContain('already collected');

    expect(getPaymentMock).toHaveBeenCalledTimes(1);
  });

  // 6 ─ Race condition
  test('concurrent collect on same trip only succeeds once', async () => {
    getPaymentMock.mockResolvedValue({
      id: 'mp-test-race',
      amount: 1500,
      status: 'approved',
    });

    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const trip = await createCompletedTrip(token);

    const collectBody = { payment_method: 'mercadopago', mp_payment_id: 'mp-test-race' };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const doCollect = async () => {
      const req = new Request(`http://localhost/api/trips/${trip.id}/collect`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(collectBody),
      });
      const res = await app.handle(req);
      const data = await res.json();
      return { status: res.status, data };
    };

    const results = await Promise.all([doCollect(), doCollect(), doCollect()]);

    const successCount = results.filter((r) => r.status === 200).length;
    const errorCount = results.filter((r) => r.status === 400).length;

    expect(successCount).toBe(1);
    expect(errorCount).toBe(2);

    for (const r of results.filter((r) => r.status === 400)) {
      expect(r.data.error.message).toContain('already collected');
    }

    const db = getDb();
    const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
    expect(updated!.is_collected).toBe(true);
  });

  // 7 ─ collect sin mp_payment_id no llama a MP (comportamiento legacy)
  test('collect with mercadopago without mp_payment_id skips MP verification', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const trip = await createCompletedTrip(token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'mercadopago' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);
    expect(data.payment_method).toBe('mercadopago');

    expect(getPaymentMock).not.toHaveBeenCalled();
  });

  // 8 ─ collect con cash no llama a MP
  test('collect with cash does not call MP', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);
    const trip = await createCompletedTrip(token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'cash' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);
    expect(data.payment_method).toBe('cash');

    const db = getDb();
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBeGreaterThan(0);

    expect(getPaymentMock).not.toHaveBeenCalled();
  });
});
