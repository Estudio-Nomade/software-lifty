process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { resetMockOverrides, setMockOverrides } from '../../shared/lib/mercado-pago';
import {
  commissionPhases,
  drivers,
  payments,
  payoutMethods,
  platformConfig,
  tripEvents,
  trips,
  users,
  withdrawals,
} from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(withdrawals);
  await db.delete(payments);
  await db.delete(payoutMethods);
  await db.delete(tripEvents);
  await db.delete(trips);
  await db.delete(drivers);
  await db.delete(users);
  await db.delete(commissionPhases);
  await db.delete(platformConfig);
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

async function addPaymentMethod(token: string, accountNumber: string): Promise<string> {
  const { data } = await request(
    'POST',
    '/api/drivers/me/payment-methods',
    {
      method_type: 'bank_transfer',
      account_number: accountNumber,
      titular_name: 'Driver Name',
    },
    token,
  );
  return data.id;
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateTables();
  const db = getDb();
  await db.insert(commissionPhases).values([
    { name: 'Lanzamiento', month_start: 1, month_end: 1, base_rate: 0.00 },
    { name: 'Medición', month_start: 2, month_end: 2, base_rate: 0.05 },
    { name: 'Estabilización', month_start: 3, month_end: 6, base_rate: 0.10 },
    { name: 'Crecimiento', month_start: 7, month_end: null, base_rate: 0.10, monthly_increment: 0.007, cap_rate: 0.15 },
  ]);
  await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-01-01' });
  resetMockOverrides();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Payments + Withdrawals', () => {
  const phone = '+5492612222222';
  const password = 'testPass123';

  test('POST /webhook creates payment with 80/20 split', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

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
        duration_minutes: 10,
      },
      token,
    );

    const { status, data } = await request(
      'POST',
      '/api/payments/webhook/mercadopago',
      { payment_id: 'mp-test-001', trip_id: trip.id },
      undefined,
      { 'X-MP-Signature': 'valid-signature-abc123' },
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Webhook processed');

    const db = getDb();
    const [payment] = await db.select().from(payments);
    expect(payment).not.toBeNull();
    expect(payment!.trip_id).toBe(trip.id);
    expect(payment!.amount).toBe(1500);
    expect(payment!.platform_amount).toBe(300);
    expect(payment!.driver_amount).toBe(1200);
    expect(payment!.mp_payment_id).toBe('mp-test-001');
    expect(payment!.status).toBe('approved');
  });

  test('POST /webhook with invalid signature returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

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
        duration_minutes: 10,
      },
      token,
    );

    const { status, data } = await request(
      'POST',
      '/api/payments/webhook/mercadopago',
      { payment_id: 'mp-test-002', trip_id: trip.id },
      undefined,
      { 'X-MP-Signature': 'invalid-signature' },
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Invalid signature');
  });

  test('GET /history returns payments', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

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
        duration_minutes: 10,
      },
      token,
    );

    await request(
      'POST',
      '/api/payments/webhook/mercadopago',
      { payment_id: 'mp-test-003', trip_id: trip.id },
      undefined,
      { 'X-MP-Signature': 'valid-sig' },
    );

    const { status, data } = await request(
      'GET',
      '/api/payments/history?page=1&limit=20',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.payments).toBeArray();
    expect(data.payments.length).toBe(1);
    expect(data.payments[0].amount).toBe(1500);
    expect(data.payments[0].platform_amount).toBe(300);
    expect(data.payments[0].driver_amount).toBe(1200);
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
  });

  test('GET /history without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/payments/history');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('POST /withdraw creates withdrawal', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const pmId = await addPaymentMethod(token, '0000003100088888888888');

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
        duration_minutes: 10,
      },
      token,
    );

    await request(
      'POST',
      '/api/payments/webhook/mercadopago',
      { payment_id: 'mp-test-004', trip_id: trip.id },
      undefined,
      { 'X-MP-Signature': 'valid-sig' },
    );

    const { status, data } = await request(
      'POST',
      '/api/payments/withdraw',
      { amount: 500, payout_method_id: pmId },
      token,
    );

    expect(status).toBe(200);
    expect(data.withdrawal_id).toBeString();
    expect(data.amount).toBe(500);
    expect(data.status).toBe('processed');

    const db = getDb();
    const [withdrawal] = await db.select().from(withdrawals);
    expect(withdrawal).not.toBeNull();
    expect(withdrawal!.amount).toBe(500);
    expect(withdrawal!.status).toBe('processed');
  });

  test('POST /withdraw with insufficient balance returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const pmId = await addPaymentMethod(token, '0000003100088888888888');

    const { status, data } = await request(
      'POST',
      '/api/payments/withdraw',
      { amount: 100, payout_method_id: pmId },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('Insufficient balance');
  });

  test('GET /withdrawals returns list', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const pmId = await addPaymentMethod(token, '0000003100088888888888');

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
        duration_minutes: 10,
      },
      token,
    );

    await request(
      'POST',
      '/api/payments/webhook/mercadopago',
      { payment_id: 'mp-test-005', trip_id: trip.id },
      undefined,
      { 'X-MP-Signature': 'valid-sig' },
    );

    await request('POST', '/api/payments/withdraw', { amount: 300, payout_method_id: pmId }, token);

    await request('POST', '/api/payments/withdraw', { amount: 200, payout_method_id: pmId }, token);

    const { status, data } = await request('GET', '/api/payments/withdrawals', undefined, token);

    expect(status).toBe(200);
    expect(data.withdrawals).toBeArray();
    expect(data.withdrawals.length).toBe(2);
    expect(data.withdrawals[0].amount).toBe(200);
    expect(data.withdrawals[1].amount).toBe(300);
  });

  test('POST /withdraw without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/payments/withdraw', {
      amount: 100,
      payout_method_id: 'some-id',
    });

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('POST /withdraw with MP rejecting payout sets withdrawal status to rejected', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const pmId = await addPaymentMethod(token, '0000003100088888888888');

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
        duration_minutes: 10,
      },
      token,
    );

    await request(
      'POST',
      '/api/payments/webhook/mercadopago',
      { payment_id: 'mp-test-reject', trip_id: trip.id },
      undefined,
      { 'X-MP-Signature': 'valid-sig' },
    );

    setMockOverrides({
      createWithdrawal: (amount) => ({ id: 'mp-rejected-001', amount, status: 'rejected' }),
    });

    const { status, data } = await request(
      'POST',
      '/api/payments/withdraw',
      { amount: 500, payout_method_id: pmId },
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('rejected');

    const db = getDb();
    const [withdrawal] = await db.select().from(withdrawals);
    expect(withdrawal).not.toBeNull();
    expect(withdrawal!.status).toBe('rejected');
    expect(withdrawal!.mp_withdrawal_id).toBe('mp-rejected-001');
  });

  test('POST /withdraw with MP network error sets withdrawal status to failed', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const pmId = await addPaymentMethod(token, '0000003100088888888888');

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
        duration_minutes: 10,
      },
      token,
    );

    await request(
      'POST',
      '/api/payments/webhook/mercadopago',
      { payment_id: 'mp-test-network-error', trip_id: trip.id },
      undefined,
      { 'X-MP-Signature': 'valid-sig' },
    );

    setMockOverrides({
      createWithdrawal: () => {
        throw new Error('MercadoPago createWithdrawal failed: 503 Service Unavailable');
      },
    });

    const { status, data } = await request(
      'POST',
      '/api/payments/withdraw',
      { amount: 500, payout_method_id: pmId },
      token,
    );

    expect(status).toBe(500);
    expect(data.error.code).toBe('INTERNAL_ERROR');

    const db = getDb();
    const [withdrawal] = await db.select().from(withdrawals);
    expect(withdrawal).not.toBeNull();
    expect(withdrawal!.status).toBe('failed');
    expect(withdrawal!.mp_withdrawal_id).toBeNull();
  });

  test('POST /withdraw with concurrent requests preserves balance integrity', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);
    const pmId = await addPaymentMethod(token, '0000003100088888888888');

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
        duration_minutes: 10,
      },
      token,
    );

    await request(
      'POST',
      '/api/payments/webhook/mercadopago',
      { payment_id: 'mp-test-race', trip_id: trip.id },
      undefined,
      { 'X-MP-Signature': 'valid-sig' },
    );

    const results = await Promise.allSettled([
      request('POST', '/api/payments/withdraw', { amount: 800, payout_method_id: pmId }, token),
      request('POST', '/api/payments/withdraw', { amount: 800, payout_method_id: pmId }, token),
    ]);

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 200,
    ).length;
    const failed = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status !== 200,
    ).length;

    expect(succeeded + failed).toBe(2);
    expect(succeeded).toBeLessThanOrEqual(1);
    expect(failed).toBeGreaterThanOrEqual(1);

    const db = getDb();
    const withdrawalRows = await db.select().from(withdrawals);
    const totalWithdrawn = withdrawalRows
      .filter((w) => w.status === 'processed')
      .reduce((sum, w) => sum + w.amount, 0);

    expect(totalWithdrawn).toBeLessThanOrEqual(1200);
  });

  test('POST /withdraw without payout method returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

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
        duration_minutes: 10,
      },
      token,
    );

    await request(
      'POST',
      '/api/payments/webhook/mercadopago',
      { payment_id: 'mp-test-no-pm', trip_id: trip.id },
      undefined,
      { 'X-MP-Signature': 'valid-sig' },
    );

    const { status, data } = await request(
      'POST',
      '/api/payments/withdraw',
      { amount: 100, payout_method_id: '00000000-0000-0000-0000-000000000000' },
      token,
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('NOT_FOUND');
    expect(data.error.message).toBe('Payout method not found');
  });
});
