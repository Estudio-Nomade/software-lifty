process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import {
  commissionPhases,
  drivers,
  platformConfig,
  tripEvents,
  trips,
  users,
} from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';
let app: any;

async function truncateTables() {
  const db = getDb();
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

async function insertCompletedTrip(driverId: string, driverEarnings = 1200): Promise<string> {
  const db = getDb();
  const now = new Date();
  const [trip] = await db
    .insert(trips)
    .values({
      driver_id: driverId,
      status: 'completed',
      origin_lat: -31.9,
      origin_lng: -65.0,
      dest_lat: -31.88,
      dest_lng: -65.02,
      driver_earnings: driverEarnings,
      created_at: now,
      updated_at: now,
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
    { name: 'Lanzamiento', month_start: 1, month_end: 1, base_rate: 0.00 },
    { name: 'Medición', month_start: 2, month_end: 2, base_rate: 0.05 },
    { name: 'Estabilización', month_start: 3, month_end: 6, base_rate: 0.10 },
    { name: 'Crecimiento', month_start: 7, month_end: null, base_rate: 0.10, monthly_increment: 0.007, cap_rate: 0.15 },
  ]);
  await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-01-01' });
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Earnings + Stats + TVF', () => {
  const phone = '+5492613333333';
  const password = 'testPass123';

  test('GET /summary returns zeroes for new driver', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { status, data } = await request('GET', '/api/earnings/summary', undefined, token);

    expect(status).toBe(200);
    expect(data.today.earnings).toBe(0);
    expect(data.today.withdrawals).toBe(0);
    expect(data.week.earnings).toBe(0);
    expect(data.week.withdrawals).toBe(0);
    expect(data.month.earnings).toBe(0);
    expect(data.month.withdrawals).toBe(0);
    expect(data.available_balance).toBe(0);
  });

  test('GET /summary returns earnings after completed trip', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);
    await insertCompletedTrip(driverId, 1200);

    const { status, data } = await request('GET', '/api/earnings/summary', undefined, token);

    expect(status).toBe(200);
    expect(data.today.earnings).toBe(1200);
    expect(data.today.withdrawals).toBe(0);
    expect(data.available_balance).toBe(1200);
  });

  test('GET /history returns paginated items', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);
    const tripId = await insertCompletedTrip(driverId, 1200);

    const { status, data } = await request(
      'GET',
      '/api/earnings/history?page=1&limit=20',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.items).toBeArray();
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);

    const earning = data.items.find((i: any) => i.type === 'earning');
    expect(earning).not.toBeNull();
    expect(earning.amount).toBe(1200);
    expect(earning.description).toBe(tripId);
    expect(earning.date).toBeString();
  });

  test('GET /history with date filters works', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);
    await insertCompletedTrip(driverId, 1200);

    const futureDate = '2027-01-01';

    const { status: futureStatus, data: futureData } = await request(
      `GET`,
      `/api/earnings/history?page=1&limit=20&from=${futureDate}&to=${futureDate}`,
      undefined,
      token,
    );
    expect(futureStatus).toBe(200);
    expect(futureData.items.length).toBe(0);

    const db = getDb();
    const [trip] = await db.select({ created_at: trips.created_at }).from(trips).limit(1);
    const tripDate = trip!.created_at!.toISOString().slice(0, 10);
    const { status, data } = await request(
      `GET`,
      `/api/earnings/history?page=1&limit=20&from=${tripDate}&to=${tripDate}`,
      undefined,
      token,
    );
    expect(status).toBe(200);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /stats returns driver stats', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { status, data } = await request('GET', '/api/drivers/me/stats', undefined, token);

    expect(status).toBe(200);
    expect(data.rating_avg).toBe(0);
    expect(data.total_trips).toBe(0);
    expect(data.completion_rate).toBe(0);
    expect(data.tvf).toBe(1.0);
    expect(data.seniority_days).toBeGreaterThanOrEqual(0);
    expect(data.total_earnings).toBe(0);
  });

  test('GET /stats calculates TVF', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);
    const db = getDb();

    const now = new Date();

    await db.insert(trips).values({
      driver_id: driverId,
      status: 'completed',
      origin_lat: -31.9,
      origin_lng: -65.0,
      dest_lat: -31.88,
      dest_lng: -65.02,
      created_at: now,
      updated_at: now,
    });

    await db.insert(trips).values({
      driver_id: driverId,
      status: 'completed',
      origin_lat: -31.9,
      origin_lng: -65.0,
      dest_lat: -31.88,
      dest_lng: -65.02,
      created_at: now,
      updated_at: now,
    });

    await db.insert(trips).values({
      driver_id: driverId,
      status: 'cancelled_early',
      origin_lat: -31.9,
      origin_lng: -65.0,
      dest_lat: -31.88,
      dest_lng: -65.02,
      created_at: now,
      updated_at: now,
    });

    await db.insert(trips).values({
      driver_id: driverId,
      status: 'cancelled_early',
      origin_lat: -31.9,
      origin_lng: -65.0,
      dest_lat: -31.88,
      dest_lng: -65.02,
      created_at: now,
      updated_at: now,
    });

    const { status, data } = await request('GET', '/api/drivers/me/stats', undefined, token);

    expect(status).toBe(200);
    expect(data.total_trips).toBe(4);
    expect(data.completion_rate).toBe(0.5);
    expect(data.tvf).toBe(0.5);
  });

  test('GET /stats TVF returns 1.0 when no recent trips', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);
    const db = getDb();

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);

    await db.insert(trips).values({
      driver_id: driverId,
      status: 'completed',
      origin_lat: -31.9,
      origin_lng: -65.0,
      dest_lat: -31.88,
      dest_lng: -65.02,
      created_at: oldDate,
      updated_at: oldDate,
    });

    await db.insert(trips).values({
      driver_id: driverId,
      status: 'cancelled_early',
      origin_lat: -31.9,
      origin_lng: -65.0,
      dest_lat: -31.88,
      dest_lng: -65.02,
      created_at: oldDate,
      updated_at: oldDate,
    });

    const { status, data } = await request('GET', '/api/drivers/me/stats', undefined, token);

    expect(status).toBe(200);
    expect(data.total_trips).toBe(2);
    expect(data.completion_rate).toBe(0.5);
    expect(data.tvf).toBe(1.0);
  });

  test('GET /stats includes total_earnings', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);
    await insertCompletedTrip(driverId, 1200);

    const { status, data } = await request('GET', '/api/drivers/me/stats', undefined, token);

    expect(status).toBe(200);
    expect(data.total_earnings).toBe(1200);
  });

  test('All endpoints require auth (401)', async () => {
    const { status: s1, data: d1 } = await request('GET', '/api/earnings/summary');
    expect(s1).toBe(401);
    expect(d1.error).toBe('Unauthorized');

    const { status: s2, data: d2 } = await request('GET', '/api/earnings/history');
    expect(s2).toBe(401);
    expect(d2.error).toBe('Unauthorized');

    const { status: s3, data: d3 } = await request('GET', '/api/drivers/me/stats');
    expect(s3).toBe(401);
    expect(d3.error).toBe('Unauthorized');
  });
});
