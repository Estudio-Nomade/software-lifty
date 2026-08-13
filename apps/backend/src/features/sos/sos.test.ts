process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import {
  commissionPhases,
  drivers,
  fuelPriceLog,
  platformConfig,
  sosEvents,
  tripEvents,
  trips,
  users,
} from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(sosEvents);
  await db.delete(tripEvents);
  await db.delete(trips);
  await db.delete(drivers);
  await db.delete(users);
  await db.delete(fuelPriceLog);
  await db.delete(commissionPhases);
  await db.delete(platformConfig);
}

async function seedPricing() {
  const db = getDb();
  await db.insert(commissionPhases).values([
    { name: 'Lanzamiento', month_start: 1, month_end: 1, base_rate: 0.0 },
    { name: 'Medicion', month_start: 2, month_end: 2, base_rate: 0.05 },
    { name: 'Estabilizacion', month_start: 3, month_end: 6, base_rate: 0.1 },
    {
      name: 'Crecimiento',
      month_start: 7,
      month_end: null,
      base_rate: 0.1,
      monthly_increment: 0.007,
      cap_rate: 0.15,
    },
  ]);
  await db.insert(fuelPriceLog).values({ price: 2100, updated_by: 'test' });
  await db
    .insert(platformConfig)
    .values({ key: 'commission_start_date', value: '2026-01-01' })
    .onConflictDoNothing();
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
  await seedPricing();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('SOS', () => {
  const phone = '+5492611234567';
  const password = 'testPass123';

  test('POST /sos creates emergency report', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { status, data } = await request('POST', '/api/sos', { type: '911' }, token);

    expect(status).toBe(200);
    expect(data.sos_id).toBeString();
    expect(data.message).toBe('Emergency reported');

    const db = getDb();
    const [sos] = await db.select().from(sosEvents).limit(1);
    expect(sos).toBeObject();
    expect(sos!.type).toBe('911');
  });

  test('POST /sos without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/sos', { type: '911' });

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('POST /sos with invalid type returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { status, data } = await request('POST', '/api/sos', { type: 'invalid_type' }, token);

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toBe('Invalid type: invalid_type');
  });

  test('POST /sos with trip_id links to trip', async () => {
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
      '/api/sos',
      { type: 'police', trip_id: trip.id },
      token,
    );

    expect(status).toBe(200);
    expect(data.sos_id).toBeString();
    expect(data.message).toBe('Emergency reported');

    const db = getDb();
    const [sos] = await db.select().from(sosEvents).limit(1);
    expect(sos!.trip_id).toBe(trip.id);
    expect(sos!.type).toBe('police');
  });

  test('POST /sos/accident creates accident report', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { status, data } = await request(
      'POST',
      '/api/sos/accident',
      {
        accident_type: 'collision',
        description: 'Rear-ended at intersection',
        lat: -31.9,
        lng: -65.0,
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.sos_id).toBeString();
    expect(data.message).toBe('Accident reported');

    const db = getDb();
    const [sos] = await db.select().from(sosEvents).limit(1);
    expect(sos!.type).toBe('accident');
    expect(sos!.accident_type).toBe('collision');
    expect(sos!.description).toBe('Rear-ended at intersection');
    expect(sos!.lat).toBe(-31.9);
    expect(sos!.lng).toBe(-65.0);
  });

  test('POST /sos/accident with invalid accident_type returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { status, data } = await request(
      'POST',
      '/api/sos/accident',
      { accident_type: 'invalid_type' },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toBe('Invalid accident_type: invalid_type');
  });

  test('POST /sos/accident without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/sos/accident', {
      accident_type: 'collision',
    });

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('POST /sos allows passenger without driver profile', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492619990001', full_name: 'Test Passenger', role: 'passenger' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const { status, data } = await request(
      'POST',
      '/api/sos',
      { type: '911', lat: -34.6, lng: -58.38 },
      token,
    );

    expect(status).toBe(200);
    expect(data.sos_id).toBeString();
    expect(data.message).toBe('Emergency reported');

    const [sos] = await db.select().from(sosEvents).limit(1);
    expect(sos!.user_id).toBe(user.id);
    expect(sos!.type).toBe('911');
    expect(sos!.lat).toBe(-34.6);
  });

  test('POST /sos passenger can link own trip_id', async () => {
    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+5492619990002', full_name: 'Passenger', role: 'passenger' })
      .returning({ id: users.id });
    const passengerToken = createTestToken(passenger.id);

    const [driverUser] = await db
      .insert(users)
      .values({ phone: '+5492619990003', full_name: 'Driver', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: driverUser.id, status: 'approved' })
      .returning({ id: drivers.id });

    const [trip] = await db
      .insert(trips)
      .values({
        passenger_id: passenger.id,
        driver_id: driver.id,
        origin_lat: -31.9,
        origin_lng: -65.0,
        dest_lat: -31.88,
        dest_lng: -65.02,
        status: 'en_route',
      })
      .returning({ id: trips.id });

    const { status, data } = await request(
      'POST',
      '/api/sos',
      { type: 'police', trip_id: trip.id },
      passengerToken,
    );

    expect(status).toBe(200);
    expect(data.sos_id).toBeString();

    const [sos] = await db.select().from(sosEvents).limit(1);
    expect(sos!.trip_id).toBe(trip.id);
    expect(sos!.user_id).toBe(passenger.id);
  });

  test('POST /sos passenger cannot link another users trip', async () => {
    const db = getDb();
    const [passengerA] = await db
      .insert(users)
      .values({ phone: '+5492619990004', full_name: 'A', role: 'passenger' })
      .returning({ id: users.id });
    const [passengerB] = await db
      .insert(users)
      .values({ phone: '+5492619990005', full_name: 'B', role: 'passenger' })
      .returning({ id: users.id });
    const tokenB = createTestToken(passengerB.id);

    const [trip] = await db
      .insert(trips)
      .values({
        passenger_id: passengerA.id,
        origin_lat: -31.9,
        origin_lng: -65.0,
        dest_lat: -31.88,
        dest_lng: -65.02,
        status: 'pending',
      })
      .returning({ id: trips.id });

    const { status } = await request(
      'POST',
      '/api/sos',
      { type: '911', trip_id: trip.id },
      tokenB,
    );

    expect(status).toBe(404);
  });
});
