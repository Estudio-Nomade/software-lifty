process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.SUPABASE_URL = '';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import {
  commissionPhases,
  driverDocuments,
  drivers,
  platformConfig,
  tripEvents,
  trips,
  users,
  vehicles,
} from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: ReturnType<typeof createApp>;

async function truncateTables() {
  const db = getDb();
  await db.delete(tripEvents);
  await db.delete(trips);
  await db.delete(driverDocuments);
  await db.delete(vehicles);
  await db.delete(drivers);
  await db.delete(users);
  await db.delete(commissionPhases);
  await db.delete(platformConfig);
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

async function createAdminToken(): Promise<string> {
  const db = getDb();
  const [admin] = await db
    .insert(users)
    .values({ phone: '+5492619990001', role: 'admin' })
    .returning({ id: users.id });
  return createTestToken(admin.id);
}

async function createDriverWithToken(
  phone: string,
): Promise<{ token: string; driverId: string; userId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Dash Driver', role: 'driver' })
    .returning({ id: users.id });
  const token = await createTestToken(user.id);
  const [driver] = await db
    .insert(drivers)
    .values({
      user_id: user.id,
      status: 'approved',
      is_online: true,
      admin_review_status: 'approved',
    })
    .returning({ id: drivers.id });
  return { token, driverId: driver.id, userId: user.id };
}

async function insertTrip(opts: {
  driverId: string;
  status: string;
  total_fare: number;
  platform_fee: number;
  driver_earnings: number;
  tip_amount?: number;
  created_at: Date;
  passenger_id?: string;
  origin_address?: string;
  dest_address?: string;
  payment_method?: string;
}) {
  const db = getDb();
  const [trip] = await db
    .insert(trips)
    .values({
      driver_id: opts.driverId,
      passenger_id: opts.passenger_id,
      status: opts.status,
      origin_lat: -31.9,
      origin_lng: -65.0,
      dest_lat: -31.88,
      dest_lng: -65.02,
      origin_address: opts.origin_address ?? 'Origen Test',
      dest_address: opts.dest_address ?? 'Destino Test',
      total_fare: opts.total_fare,
      platform_fee: opts.platform_fee,
      driver_earnings: opts.driver_earnings,
      tip_amount: opts.tip_amount ?? 0,
      payment_method: opts.payment_method ?? 'cash',
      created_at: opts.created_at,
      updated_at: opts.created_at,
    })
    .returning({ id: trips.id });
  return trip.id;
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateTables();
  const db = getDb();
  await db.insert(commissionPhases).values([
    { name: 'Lanzamiento', day_start: 1, day_end: 7, base_rate: 0.0 },
    { name: 'Medición', day_start: 8, day_end: 14, base_rate: 0.05 },
    { name: 'Estabilización', day_start: 15, day_end: 120, base_rate: 0.1 },
    {
      name: 'Crecimiento',
      day_start: 121,
      day_end: null,
      base_rate: 0.1,
      daily_increment: null,
      cap_rate: 0.15,
    },
  ]);
  await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-01-01' });
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Admin dashboard + driver trips', () => {
  test('GET /dashboard/summary without auth returns 401', async () => {
    const { status } = await request('GET', '/api/admin/dashboard/summary');
    expect(status).toBe(401);
  });

  test('GET /dashboard/summary with non-admin returns 403', async () => {
    const { token } = await createDriverWithToken('+5492611110001');
    const { status } = await request('GET', '/api/admin/dashboard/summary', undefined, token);
    expect(status).toBe(403);
  });

  test('GET /dashboard/summary admin 200 shape + money sums', async () => {
    const adminToken = await createAdminToken();
    const { driverId } = await createDriverWithToken('+5492611110002');
    const now = new Date();

    await insertTrip({
      driverId,
      status: 'completed',
      total_fare: 1000,
      platform_fee: 100,
      driver_earnings: 900,
      tip_amount: 50,
      created_at: now,
    });
    await insertTrip({
      driverId,
      status: 'rated',
      total_fare: 500,
      platform_fee: 50,
      driver_earnings: 450,
      created_at: now,
    });
    await insertTrip({
      driverId,
      status: 'cancelled',
      total_fare: 200,
      platform_fee: 20,
      driver_earnings: 180,
      created_at: now,
    });
    await insertTrip({
      driverId,
      status: 'in_trip',
      total_fare: 300,
      platform_fee: 30,
      driver_earnings: 270,
      created_at: now,
    });

    const { status, data } = await request(
      'GET',
      '/api/admin/dashboard/summary?range=today',
      undefined,
      adminToken,
    );

    expect(status).toBe(200);
    expect(data.range).toBe('today');
    expect(data.from).toBeString();
    expect(data.to).toBeString();
    expect(data.drivers).toMatchObject({
      online_now: 1,
      approved: 1,
      pending_review: 0,
    });
    expect(data.trips.completed).toBe(2);
    expect(data.trips.in_progress).toBe(1);
    expect(data.money.currency).toBe('ARS');
    expect(data.money.gross_fare).toBe(1500);
    expect(data.money.platform_fee).toBe(150);
    expect(data.money.driver_earnings).toBe(1350);
    expect(data.money.tips).toBe(50);
    expect(data.money.avg_ticket).toBe(750);
    expect(data.money.take_rate).toBeCloseTo(0.1, 5);
    expect(data.commission).toHaveProperty('phase');
    expect(data.commission).toHaveProperty('currentDay');
    expect(data.commission).toHaveProperty('rate');
  });

  test('GET /dashboard/summary range=7d filters by created_at window', async () => {
    const adminToken = await createAdminToken();
    const { driverId } = await createDriverWithToken('+5492611110003');
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    await insertTrip({
      driverId,
      status: 'completed',
      total_fare: 1000,
      platform_fee: 100,
      driver_earnings: 900,
      created_at: tenDaysAgo,
    });
    await insertTrip({
      driverId,
      status: 'completed',
      total_fare: 400,
      platform_fee: 40,
      driver_earnings: 360,
      created_at: twoDaysAgo,
    });

    const todayRes = await request(
      'GET',
      '/api/admin/dashboard/summary?range=today',
      undefined,
      adminToken,
    );
    const weekRes = await request(
      'GET',
      '/api/admin/dashboard/summary?range=7d',
      undefined,
      adminToken,
    );

    expect(todayRes.status).toBe(200);
    expect(weekRes.status).toBe(200);
    // twoDaysAgo is in 7d; tenDaysAgo is not. today may or may not include twoDaysAgo
    // depending on clock — twoDaysAgo is never "today".
    expect(todayRes.data.trips.completed).toBe(0);
    expect(todayRes.data.money.gross_fare).toBe(0);
    expect(weekRes.data.trips.completed).toBe(1);
    expect(weekRes.data.money.gross_fare).toBe(400);
    expect(weekRes.data.from).not.toBe(todayRes.data.from);
  });

  test('GET /drivers/:id/trips non-admin 403', async () => {
    const { token, driverId } = await createDriverWithToken('+5492611110004');
    const { status } = await request(
      'GET',
      `/api/admin/drivers/${driverId}/trips`,
      undefined,
      token,
    );
    expect(status).toBe(403);
  });

  test('GET /drivers/:id/trips missing driver 404', async () => {
    const adminToken = await createAdminToken();
    const { status } = await request(
      'GET',
      '/api/admin/drivers/00000000-0000-4000-8000-000000000099/trips',
      undefined,
      adminToken,
    );
    expect(status).toBe(404);
  });

  test('GET /drivers/:id/trips lists only that driver completed+rated by default + pagination + split', async () => {
    const adminToken = await createAdminToken();
    const a = await createDriverWithToken('+5492611110005');
    const b = await createDriverWithToken('+5492611110006');
    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+5492611110099', full_name: 'Pax Uno', role: 'passenger' })
      .returning({ id: users.id });

    const now = new Date();
    await insertTrip({
      driverId: a.driverId,
      status: 'completed',
      total_fare: 1000,
      platform_fee: 100,
      driver_earnings: 900,
      tip_amount: 20,
      created_at: new Date(now.getTime() - 1000),
      passenger_id: passenger.id,
      payment_method: 'cash',
    });
    await insertTrip({
      driverId: a.driverId,
      status: 'rated',
      total_fare: 500,
      platform_fee: 50,
      driver_earnings: 450,
      created_at: now,
    });
    await insertTrip({
      driverId: a.driverId,
      status: 'cancelled',
      total_fare: 200,
      platform_fee: 20,
      driver_earnings: 180,
      created_at: now,
    });
    await insertTrip({
      driverId: a.driverId,
      status: 'in_trip',
      total_fare: 300,
      platform_fee: 30,
      driver_earnings: 270,
      created_at: now,
    });
    await insertTrip({
      driverId: b.driverId,
      status: 'completed',
      total_fare: 9999,
      platform_fee: 999,
      driver_earnings: 9000,
      created_at: now,
    });

    const page1 = await request(
      'GET',
      `/api/admin/drivers/${a.driverId}/trips?limit=1&offset=0`,
      undefined,
      adminToken,
    );
    expect(page1.status).toBe(200);
    expect(page1.data.total).toBe(2);
    expect(page1.data.items).toHaveLength(1);
    expect(page1.data.limit).toBe(1);
    expect(page1.data.offset).toBe(0);
    expect(page1.data.totals_in_filter).toEqual({
      trip_count: 2,
      gross_fare: 1500,
      platform_fee: 150,
      driver_earnings: 1350,
    });

    const row = page1.data.items[0];
    expect(row.platform_fee + row.driver_earnings).toBe(row.total_fare);
    expect(row.status).toBe('rated');

    const page2 = await request(
      'GET',
      `/api/admin/drivers/${a.driverId}/trips?limit=1&offset=1`,
      undefined,
      adminToken,
    );
    expect(page2.data.items).toHaveLength(1);
    expect(page2.data.items[0].status).toBe('completed');
    expect(page2.data.items[0].passenger_name).toBe('Pax Uno');
    expect(page2.data.items[0].tip_amount).toBe(20);

    const all = await request(
      'GET',
      `/api/admin/drivers/${a.driverId}/trips`,
      undefined,
      adminToken,
    );
    expect(all.data.items.every((t: { id: string }) => true)).toBe(true);
    expect(all.data.items).toHaveLength(2);
    for (const t of all.data.items) {
      expect(t.platform_fee + t.driver_earnings).toBe(t.total_fare);
    }

    // Ensure driver B trips never leak
    const bIds = (
      await db.select({ id: trips.id }).from(trips).where(eq(trips.driver_id, b.driverId))
    ).map((r) => r.id);
    expect(all.data.items.some((t: { id: string }) => bIds.includes(t.id))).toBe(false);
  });
});
