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
  platformConfig,
  tripEvents,
  tripMessages,
  trips,
  userDebt,
  users,
} from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';
import { cancellationService } from './service';
import { setPaymentGateway } from './gateway';

let app: ReturnType<typeof createApp>;
let testId = 0;

async function truncateTables() {
  const db = getDb();
  await db.delete(cancelationLog);
  await db.delete(driverFeePayouts);
  await db.delete(userDebt);
  await db.delete(tripEvents);
  await db.delete(tripMessages);
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
    .values({ phone: `+549261${String(testId).padStart(6, '0')}`, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

beforeAll(() => {
  app = createApp(createTestAuthPlugin());
});

beforeEach(async () => {
  testId++;
  await truncateTables();
  setPaymentGateway({ async chargeFee() { return false; } });
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

describe('cancellationService', () => {
  test('expireSearchTimeouts cancels stale pending trips', async () => {
    const token = await registerDriver();
    await request('PUT', '/api/drivers/me', { first_name: 'Test Driver' }, token);
    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+549261000111', full_name: 'Pax', role: 'passenger' })
      .returning({ id: users.id });
    const [trip] = await db
      .insert(trips)
      .values({
        passenger_id: passenger.id,
        status: 'pending',
        origin_lat: -31.9,
        origin_lng: -65,
        dest_lat: -31.88,
        dest_lng: -65.02,
        created_at: new Date(Date.now() - 301_000),
        updated_at: new Date(Date.now() - 301_000),
      })
      .returning();

    const n = await cancellationService.expireSearchTimeouts();
    expect(n).toBe(1);
    const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
    expect(updated.status).toBe('cancelled');
    const [log] = await db.select().from(cancelationLog).where(eq(cancelationLog.trip_id, trip.id));
    expect(log.reason).toBe('auto_timeout');
    expect(log.fee_applied).toBe(0);
  });
});
