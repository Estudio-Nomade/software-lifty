process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
delete process.env.REDIS_URL;

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import {
  cancelationLog,
  commissionPhases,
  driverFeePayouts,
  drivers,
  driverTvfMetrics,
  platformConfig,
  trips,
  userBlocks,
  userCancelationMetrics,
  userDebt,
  users,
} from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';

let app: ReturnType<typeof createApp>;
let testId = 0;

async function truncateTables() {
  const db = getDb();
  await db.delete(cancelationLog);
  await db.delete(driverFeePayouts);
  await db.delete(userDebt);
  await db.delete(userBlocks);
  await db.delete(userCancelationMetrics);
  await db.delete(driverTvfMetrics);
  await db.delete(trips);
  await db.delete(drivers);
  await db.delete(users);
  await db.delete(commissionPhases);
  await db.delete(platformConfig);
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-forwarded-for': `10.0.0.${(testId % 254) + 1}`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const data = await res.json();
  return { status: res.status, data };
}

async function registerDriver(): Promise<string> {
  const db = getDb();
  testId++;
  const [user] = await db
    .insert(users)
    .values({
      phone: `+549261${String(testId).padStart(6, '0')}`,
      full_name: 'Test Driver',
      role: 'driver',
    })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

async function createDriverRow(token: string): Promise<string> {
  await request('PUT', '/api/drivers/me', { first_name: 'Test Driver' }, token);
  const db = getDb();
  const [driver] = await db.select({ id: drivers.id }).from(drivers).limit(1);
  return driver!.id;
}

beforeAll(() => {
  app = createApp(createTestAuthPlugin());
});

beforeEach(async () => {
  testId++;
  await truncateTables();
  const db = getDb();
  await db.insert(commissionPhases).values([
    { name: 'Lanzamiento', month_start: 1, month_end: 1, base_rate: 0.0 },
    { name: 'Medición', month_start: 2, month_end: 2, base_rate: 0.05 },
    { name: 'Estabilización', month_start: 3, month_end: 6, base_rate: 0.1 },
    { name: 'Crecimiento', month_start: 7, month_end: null, base_rate: 0.1, monthly_increment: 0.007, cap_rate: 0.15 },
  ]);
  await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-01-01' });
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('GET /api/drivers/me/cancellation-metrics', () => {
  test('returns default metric shape with no trips', async () => {
    const token = await registerDriver();
    await createDriverRow(token);

    const { status, data } = await request(
      'GET',
      '/api/drivers/me/cancellation-metrics',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.tvf_rate_pct).toBeNull();
    expect(data.cancel_rate_pct).toBeNull();
    expect(data.tvf_completed).toBe(0);
    expect(data.tvf_cancels).toBe(0);
    expect(data.period_days).toBe(30);
    expect(data.total_cancels).toBe(0);
    expect(data.driver_cancels).toBe(0);
    expect(data.no_shows).toBe(0);
    expect(data.payouts_pending_ars).toBe(0);
    expect(data.payouts_paid_ars).toBe(0);
    expect(data.platform_debt).toBe(0);
    expect(data.debt_cap_ars).toBe(6000);
    expect(data.debt_remaining_ars).toBe(6000);
    expect(data.commission_active).toBe(true);
  });

  test('reads platform.debt_cap_ars from config', async () => {
    const token = await registerDriver();
    await createDriverRow(token);
    const db = getDb();
    await db.insert(platformConfig).values({ key: 'platform.debt_cap_ars', value: '8000' });

    const { status, data } = await request(
      'GET',
      '/api/drivers/me/cancellation-metrics',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.debt_cap_ars).toBe(8000);
    expect(data.debt_remaining_ars).toBe(8000);
  });

  test('driver_cancel counts for TVF and returns enriched payload', async () => {
    const token = await registerDriver();
    const driverId = await createDriverRow(token);
    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+549261999999', full_name: 'Pax', role: 'passenger' })
      .returning({ id: users.id });
    const [trip] = await db
      .insert(trips)
      .values({
        driver_id: driverId,
        passenger_id: passenger.id,
        status: 'accepted',
        origin_lat: -31.9,
        origin_lng: -65.0,
        dest_lat: -31.88,
        dest_lng: -65.02,
        total_fare: 0,
        platform_fee: 0,
        driver_earnings: 0,
        assigned_at: new Date(),
      })
      .returning();

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/cancel`,
      { reason: 'driver_cancel' },
      token,
    );

    expect(status).toBe(200);
    expect(data.cancel_reason).toBe('driver_cancel');
    expect(data.cancel_actor).toBe('driver');
    expect(data.counts_for_tvf).toBe(true);
    expect(data.credit_driver).toBe(false);
    expect(data.fee_applied).toBe(0);

    const { data: metrics } = await request(
      'GET',
      '/api/drivers/me/cancellation-metrics',
      undefined,
      token,
    );
    expect(metrics.total_cancels).toBe(1);
    expect(metrics.driver_cancels).toBe(1);
    expect(metrics.no_shows).toBe(0);
    expect(metrics.tvf_cancels).toBe(1);
    expect(metrics.tvf_completed).toBe(0);
    expect(metrics.tvf_rate_pct).toBe(0);
    expect(metrics.cancel_rate_pct).toBe(100);
  });

  test('no_show does not count for TVF and creates a pending payout', async () => {
    const token = await registerDriver();
    const driverId = await createDriverRow(token);
    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+549261999998', full_name: 'Pax', role: 'passenger' })
      .returning({ id: users.id });
    const [trip] = await db
      .insert(trips)
      .values({
        driver_id: driverId,
        passenger_id: passenger.id,
        status: 'waiting',
        origin_lat: -31.9,
        origin_lng: -65.0,
        dest_lat: -31.88,
        dest_lng: -65.02,
        total_fare: 0,
        platform_fee: 0,
        driver_earnings: 0,
        waiting_since: new Date(Date.now() - 301_000),
      })
      .returning();

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/cancel`,
      { reason: 'no_show' },
      token,
    );

    expect(status).toBe(200);
    expect(data.cancel_reason).toBe('no_show');
    expect(data.cancel_actor).toBe('driver');
    expect(data.counts_for_tvf).toBe(false);
    expect(data.credit_driver).toBe(true);
    expect(data.fee_applied).toBe(600);

    const { data: metrics } = await request(
      'GET',
      '/api/drivers/me/cancellation-metrics',
      undefined,
      token,
    );
    expect(metrics.no_shows).toBe(1);
    expect(metrics.driver_cancels).toBe(0);
    expect(metrics.tvf_cancels).toBe(0);
    expect(metrics.tvf_rate_pct).toBeNull();
    expect(metrics.cancel_rate_pct).toBeNull();
    expect(metrics.payouts_pending_ars).toBe(600);
    expect(metrics.payouts_paid_ars).toBe(0);
  });
});
