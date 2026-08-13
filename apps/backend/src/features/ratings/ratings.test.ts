process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import {
  commissionPhases,
  drivers,
  platformConfig,
  ratings,
  tripEvents,
  trips,
  users,
} from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(ratings);
  await db.delete(tripEvents);
  await db.delete(trips);
  await db.delete(drivers);
  await db.delete(users);
  await db.delete(commissionPhases);
  await db.delete(platformConfig);
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
  const { data: me } = await request('GET', '/api/auth/me', undefined, token);
  const db = getDb();
  const [driver] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.user_id, me.id))
    .limit(1);
  return driver!.id;
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

describe('Ratings', () => {
  const driverPhone = '+5492611111111';
  const passengerPhone = '+5492612222222';
  const password = 'testPass123';

  async function setupCompletedTrip(driverToken: string, passengerUserId: string): Promise<string> {
    await createDriverRow(driverToken);

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
      driverToken,
    );

    const db = getDb();
    await db
      .update(trips)
      .set({ passenger_id: passengerUserId, status: 'completed', updated_at: new Date() })
      .where(eq(trips.id, trip.id));

    return trip.id;
  }

  test('POST rate trip succeeds', async () => {
    const driverToken = await registerAndGetToken(driverPhone, password);
    const passengerToken = await registerAndGetToken(passengerPhone, password);
    await createDriverRow(passengerToken);

    const passengerUser = await request('GET', '/api/auth/me', undefined, passengerToken);
    const tripId = await setupCompletedTrip(driverToken, passengerUser.data.id);

    const { status, data } = await request(
      'POST',
      `/api/ratings/trips/${tripId}`,
      { rating: 4, tags: 'friendly,punctual' },
      driverToken,
    );

    expect(status).toBe(200);
    expect(data.rating_id).toBeString();
    expect(data.message).toBe('Rating submitted');
  });

  test('POST rate without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/ratings/trips/some-id', { rating: 3 });

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('POST rate non-existent trip returns error', async () => {
    const token = await registerAndGetToken(driverPhone, password);
    await createDriverRow(token);

    const { status, data } = await request(
      'POST',
      '/api/ratings/trips/00000000-0000-0000-0000-000000000000',
      { rating: 3 },
      token,
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('NOT_FOUND');
    expect(data.error.message).toBe('Trip not found');
  });

  test('POST rate trip not in completed status returns error', async () => {
    const token = await registerAndGetToken(driverPhone, password);
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
      `/api/ratings/trips/${trip.id}`,
      { rating: 3 },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toBe('Trip is not in completed status');
  });

  test('POST rate duplicate returns error', async () => {
    const driverToken = await registerAndGetToken(driverPhone, password);
    const passengerToken = await registerAndGetToken(passengerPhone, password);
    await createDriverRow(passengerToken);

    const passengerUser = await request('GET', '/api/auth/me', undefined, passengerToken);
    const tripId = await setupCompletedTrip(driverToken, passengerUser.data.id);

    await request('POST', `/api/ratings/trips/${tripId}`, { rating: 4 }, driverToken);

    const { status, data } = await request(
      'POST',
      `/api/ratings/trips/${tripId}`,
      { rating: 5 },
      driverToken,
    );

    expect(status).toBe(409);
    expect(data.error.code).toBe('CONFLICT');
    expect(data.error.message).toBe('Rating already exists for this trip');
  });

  test('POST rate with invalid rating returns error', async () => {
    const driverToken = await registerAndGetToken(driverPhone, password);
    const passengerToken = await registerAndGetToken(passengerPhone, password);
    await createDriverRow(passengerToken);

    const passengerUser = await request('GET', '/api/auth/me', undefined, passengerToken);
    const tripId = await setupCompletedTrip(driverToken, passengerUser.data.id);

    const { status, data } = await request(
      'POST',
      `/api/ratings/trips/${tripId}`,
      { rating: 0 },
      driverToken,
    );

    expect(status).toBe(400);
  });

  test('POST rate updates driver rating_avg', async () => {
    const driverToken = await registerAndGetToken(driverPhone, password);
    const passengerToken = await registerAndGetToken(passengerPhone, password);
    const passengerDriverId = await createDriverRow(passengerToken);

    const passengerUser = await request('GET', '/api/auth/me', undefined, passengerToken);

    // Trip 1 — rate with rating 3
    const tripId1 = await setupCompletedTrip(driverToken, passengerUser.data.id);
    await request('POST', `/api/ratings/trips/${tripId1}`, { rating: 3 }, driverToken);

    const db = getDb();
    const [driver1] = await db
      .select({ rating_avg: drivers.rating_avg })
      .from(drivers)
      .where(eq(drivers.id, passengerDriverId));
    expect(driver1!.rating_avg).toBe(3);

    // Trip 2 — rate with rating 5
    const tripId2 = await setupCompletedTrip(driverToken, passengerUser.data.id);
    await request('POST', `/api/ratings/trips/${tripId2}`, { rating: 5 }, driverToken);

    const [driver2] = await db
      .select({ rating_avg: drivers.rating_avg })
      .from(drivers)
      .where(eq(drivers.id, passengerDriverId));
    expect(driver2!.rating_avg).toBe(4);
  });
});
