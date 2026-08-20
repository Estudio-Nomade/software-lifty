process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
delete process.env.REDIS_URL;

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { commissionPhases, drivers, fuelPriceLog, platformConfig, ratings, tripEvents, tripMessages, trips, users } from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';

let app: any;
let testId = 0;

async function truncateTables() {
  const db = getDb();
  await db.delete(tripEvents);
  await db.delete(tripMessages);
  await db.delete(trips);
  await db.delete(drivers);
  await db.delete(users);
  await db.delete(commissionPhases);
  await db.delete(platformConfig);
  await db.delete(fuelPriceLog);
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

async function completeTrip(token: string): Promise<{ tripId: string; platformFee: number }> {
  const { data: trip } = await request(
    'POST',
    '/api/trips',
    { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
    token,
  );
  const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
  await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
  await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);
  await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);
  await request('POST', `/api/trips/${trip.id}/complete`, { lat: -31.88, lng: -65.02 }, token);
  return { tripId: trip.id, platformFee: Number(trip.platform_fee ?? 0) };
}

beforeAll(() => {
  app = createApp(createTestAuthPlugin());
});

beforeEach(async () => {
  testId++;
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

describe('Trip State Machine', () => {
  const phone = '+5492611111111';
  const password = 'testPass123';

  test('1. accept from request_received → accepted', async () => {
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
        duration_minutes: 15,
      },
      token,
    );

    expect(trip.status).toBe('request_received');
    expect(trip.id).toBeString();

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/accept`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('accepted');

    const db = getDb();
    const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
    expect(events.length).toBe(2);
    expect(events[1].from_status).toBe('request_received');
    expect(events[1].to_status).toBe('accepted');
  });

  test('2. reject from request_received → rejected', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/reject`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('rejected');

    const db = getDb();
    const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
    expect(events.length).toBe(2);
    expect(events[1].from_status).toBe('request_received');
    expect(events[1].to_status).toBe('rejected');
  });

  test('2b. accept generates 4-digit verification_code', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { status, data } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);

    expect(status).toBe(200);
    expect(data.verification_code).toMatch(/^\d{4}$/);

    const db = getDb();
    const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
    expect(updated!.verification_code).toMatch(/^\d{4}$/);
    expect(updated!.verification_code).toBe(data.verification_code);
  });

  test('3. en-route from accepted → en_route', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/en-route`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('en_route');

    const db = getDb();
    const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
    expect(events.length).toBe(3);
    expect(events[2].from_status).toBe('accepted');
    expect(events[2].to_status).toBe('en_route');
  });

  test('4. arrived from en_route → waiting (sets waiting_since)', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/arrived`,
      { lat: -31.9, lng: -65.0 },
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('waiting');
    expect(data.waiting_since).toBeString();

    const db = getDb();
    const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
    expect(updated!.waiting_since).not.toBeNull();
  });

  test('5. start with correct verification_code → in_trip', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    const code = accepted.verification_code;

    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);

    const { status, data } = await request('POST', `/api/trips/${trip.id}/start`, { verification_code: code }, token);

    expect(status).toBe(200);
    expect(data.status).toBe('in_trip');

    const db = getDb();
    const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
    expect(events.length).toBe(5);
    expect(events[4].from_status).toBe('waiting');
    expect(events[4].to_status).toBe('in_trip');
  });

  test('5b. start with wrong verification_code fails', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    expect(accepted.verification_code).toBeTruthy();

    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);

    const { status, data } = await request('POST', `/api/trips/${trip.id}/start`, { verification_code: '9999' }, token);

    expect(status).toBe(400);
    expect(data.error.message).toMatch(/verificación/);
  });

  test('5c. start without verification_code returns validation error', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);

    const res = await app.handle(new Request(`http://localhost/api/trips/${trip.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    }));

    expect(res.status).toBe(400);
  });

  test('6. complete from in_trip → completed', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/complete`,
      { lat: -31.88, lng: -65.02 },
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('completed');

    const db = getDb();
    const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
    expect(events.length).toBe(6);
    expect(events[5].from_status).toBe('in_trip');
    expect(events[5].to_status).toBe('completed');
  });

  test('7. no-show from waiting before 5min is rejected', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/cancel`,
      { reason: 'no_show' },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('NO_SHOW_TOO_EARLY');
  });

  test('8. no-show from waiting after 5min succeeds', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);

    const db = getDb();
    await db
      .update(trips)
      .set({
        status: 'waiting',
        waiting_since: new Date(Date.now() - 10 * 60 * 1000),
        updated_at: new Date(),
      })
      .where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/cancel`,
      { reason: 'no_show' },
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('cancelled');
  });

  test('9. GET /active returns active trip', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);

    const { status, data } = await request('GET', '/api/trips/active', undefined, token);

    expect(status).toBe(200);
    expect(data).not.toBeNull();
    expect(data.id).toBe(trip.id);
    expect(data.status).toBe('accepted');
  });

  test('9b. GET /active does not return a stale waiting trip', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);

    const db = getDb();
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await db
      .update(trips)
      .set({ waiting_since: fiveDaysAgo, updated_at: fiveDaysAgo })
      .where(eq(trips.id, trip.id));

    const res = await app.handle(
      new Request('http://localhost/api/trips/active', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body === '' || body === 'null').toBe(true);
  });

  test('10. GET /history returns paginated trips', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    for (let i = 0; i < 3; i++) {
      await request(
        'POST',
        '/api/trips',
        { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
        token,
      );
    }

    const { status, data } = await request(
      'GET',
      '/api/trips/history?page=1&limit=2',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    expect(data[0].origin_lat).toBe(-31.9);
  });

  test('11. GET /:id returns trip detail', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { status, data } = await request('GET', `/api/trips/${trip.id}`, undefined, token);

    expect(status).toBe(200);
    expect(data.id).toBe(trip.id);
    expect(data.origin_lat).toBe(-31.9);
    expect(data.dest_lat).toBe(-31.88);
  });

  test('12. invalid transition returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);

    const { status, data } = await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('Invalid transition');
  });

  test('13. create trip with fare calculation', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { status, data } = await request(
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

    expect(status).toBe(200);
    expect(data.status).toBe('request_received');
    expect(data.total_fare).toBeGreaterThan(0);
    expect(data.base_fare).toBeGreaterThan(0);
    expect(data.distance_fare).toBeGreaterThan(0);
    expect(data.time_fare).toBeGreaterThan(0);
    expect(data.platform_fee).toBeGreaterThan(0);
    expect(data.driver_earnings).toBeGreaterThan(0);
    expect(data.driver_earnings).toBeLessThan(data.total_fare);
  });

  test('14. collect cash trip sets is_collected and accumulates platform_debt', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);
    await request('POST', `/api/trips/${trip.id}/complete`, { lat: -31.88, lng: -65.02 }, token);

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
  });

  test('15. collect transfer trip sets is_collected and does NOT accumulate platform_debt', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);
    await request('POST', `/api/trips/${trip.id}/complete`, { lat: -31.88, lng: -65.02 }, token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'transfer' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);
    expect(data.payment_method).toBe('transfer');

    const db = getDb();
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBe(0);
  });

  test('16. collect already collected trip returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { data: accepted } = await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);
    await request('POST', `/api/trips/${trip.id}/complete`, { lat: -31.88, lng: -65.02 }, token);

    await request('PUT', `/api/trips/${trip.id}/collect`, { payment_method: 'cash' }, token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'transfer' },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('already collected');
  });

  test('cap-1. rate 0 + cash collect does not accumulate debt', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const db = getDb();
    await db
      .update(platformConfig)
      .set({ value: '2026-08-01' })
      .where(eq(platformConfig.key, 'commission_start_date'));

    const { tripId } = await completeTrip(token);
    const { status, data } = await request(
      'PUT',
      `/api/trips/${tripId}/collect`,
      { payment_method: 'cash' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBe(0);
  });

  test('cap-2. rate > 0 + cash under cap accumulates platform_debt', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { tripId } = await completeTrip(token);
    const db = getDb();
    await db.update(trips).set({ platform_fee: 200 }).where(eq(trips.id, tripId));

    const { status, data } = await request(
      'PUT',
      `/api/trips/${tripId}/collect`,
      { payment_method: 'cash' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBe(200);
  });

  test('cap-3. rate > 0 + cash that would exceed 6000 returns DEBT_CAP_REACHED', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { tripId } = await completeTrip(token);
    const db = getDb();
    await db.update(drivers).set({ platform_debt: 5900 }).where(eq(drivers.id, driverId));
    await db.update(trips).set({ platform_fee: 200 }).where(eq(trips.id, tripId));

    const { status, data } = await request(
      'PUT',
      `/api/trips/${tripId}/collect`,
      { payment_method: 'cash' },
      token,
    );

    expect(status).toBe(409);
    expect(data.error.code).toBe('DEBT_CAP_REACHED');

    const [tripAfter] = await db.select().from(trips).where(eq(trips.id, tripId));
    expect(tripAfter.is_collected).toBe(false);
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBe(5900);
  });

  test('cap-4. rate > 0 + transfer does not change platform_debt', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { tripId } = await completeTrip(token);
    const db = getDb();
    await db.update(drivers).set({ platform_debt: 1200 }).where(eq(drivers.id, driverId));

    const { status, data } = await request(
      'PUT',
      `/api/trips/${tripId}/collect`,
      { payment_method: 'transfer' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBe(1200);
  });

  test('cap-5. debt + fee exactly at cap is allowed', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { tripId } = await completeTrip(token);
    const db = getDb();
    await db.update(drivers).set({ platform_debt: 5800 }).where(eq(drivers.id, driverId));
    await db.update(trips).set({ platform_fee: 200 }).where(eq(trips.id, tripId));

    const { status, data } = await request(
      'PUT',
      `/api/trips/${tripId}/collect`,
      { payment_method: 'cash' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBe(6000);
  });

  test('17. accept endpoint enforces rate limit (5 req/min)', async () => {
    const ip = '203.0.113.100';
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-forwarded-for': ip,
    };

    const apiRequest = async (method: string, path: string, body?: object) => {
      const req = new Request(`http://localhost${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      return app.handle(req);
    };

    const tripRes = await apiRequest('POST', '/api/trips', {
      origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02,
      vehicle_type: 'car', distance_km: 5, duration_minutes: 15,
    });
    const { id: tripId } = await tripRes.json();

    const callAccept = async () => {
      const res = await apiRequest('POST', `/api/trips/${tripId}/accept`);
      return res.status;
    };

    expect(await callAccept()).toBe(200);

    for (let i = 0; i < 4; i++) {
      expect(await callAccept()).toBe(400);
    }

    expect(await callAccept()).toBe(429);
  });

  test('18. cancel endpoint enforces rate limit (5 req/min)', async () => {
    const ip = '203.0.113.101';
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-forwarded-for': ip,
    };

    const apiRequest = async (method: string, path: string, body?: object) => {
      const req = new Request(`http://localhost${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      return app.handle(req);
    };

    const tripRes = await apiRequest('POST', '/api/trips', {
      origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02,
      vehicle_type: 'car', distance_km: 5, duration_minutes: 15,
    });
    const { id: tripId } = await tripRes.json();

    const acceptRes = await apiRequest('POST', `/api/trips/${tripId}/accept`);
    expect(acceptRes.status).toBe(200);

    const callCancel = async () => {
      const res = await apiRequest('POST', `/api/trips/${tripId}/cancel`);
      return res.status;
    };

    expect(await callCancel()).toBe(200);

    for (let i = 0; i < 4; i++) {
      expect(await callCancel()).toBe(409);
    }

    expect(await callCancel()).toBe(429);
  });

  test('19. complete endpoint enforces rate limit (3 req/min)', async () => {
    const ip = '203.0.113.102';
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-forwarded-for': ip,
    };

    const apiRequest = async (method: string, path: string, body?: object) => {
      const req = new Request(`http://localhost${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      return app.handle(req);
    };

    const tripRes = await apiRequest('POST', '/api/trips', {
      origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02,
      vehicle_type: 'car', distance_km: 5, duration_minutes: 15,
    });
    const { id: tripId } = await tripRes.json();

    const acceptRes = await apiRequest('POST', `/api/trips/${tripId}/accept`);
    expect(acceptRes.status).toBe(200);
    const acceptData = await acceptRes.json();
    const enRouteRes = await apiRequest('POST', `/api/trips/${tripId}/en-route`);
    expect(enRouteRes.status).toBe(200);
    const arrivedRes = await apiRequest('POST', `/api/trips/${tripId}/arrived`, { lat: -31.9, lng: -65.0 });
    expect(arrivedRes.status).toBe(200);
    const startRes = await apiRequest('POST', `/api/trips/${tripId}/start`, { verification_code: acceptData.verification_code });
    expect(startRes.status).toBe(200);

    const callComplete = async () => {
      const res = await apiRequest('POST', `/api/trips/${tripId}/complete`, { lat: -31.88, lng: -65.02 });
      return res.status;
    };

    expect(await callComplete()).toBe(200);
    expect(await callComplete()).toBe(400);
    expect(await callComplete()).toBe(400);

    expect(await callComplete()).toBe(429);
  });

  test('20. GET /active returns passenger fields as null when no passenger_id set', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);

    const { status, data } = await request('GET', '/api/trips/active', undefined, token);

    expect(status).toBe(200);
    expect(data).not.toBeNull();
    expect(data.passenger_name).toBeNull();
    expect(data.passenger_avatar_url).toBeNull();
    expect(data.passenger_phone).toBeNull();
    expect(data.passenger_rating).toBeNull();
    expect(data.passenger_id).toBeNull();
  });

  test('21. GET /:id returns passenger fields when passenger_id is set', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+5492612222222', full_name: 'John Passenger', role: 'driver' })
      .returning({ id: users.id });

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
        passenger_id: passenger.id,
      },
      token,
    );

    const { status, data } = await request('GET', `/api/trips/${trip.id}`, undefined, token);

    expect(status).toBe(200);
    expect(data.id).toBe(trip.id);
    expect(data.passenger_name).toBe('John Passenger');
    expect(data.passenger_avatar_url).toBeNull();
    expect(data.passenger_phone).toBe('+5492612222222');
    expect(data.passenger_rating).toBeNull();
  });

  test('22. GET /:id returns passenger rating when ratings exist', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+5492613333333', full_name: 'Rated Passenger', role: 'driver' })
      .returning({ id: users.id });

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
        passenger_id: passenger.id,
      },
      token,
    );

    await db.insert(ratings).values({
      trip_id: trip.id,
      rater_id: passenger.id,
      ratee_id: passenger.id,
      score: 4,
    });

    await db.insert(ratings).values({
      trip_id: trip.id,
      rater_id: passenger.id,
      ratee_id: passenger.id,
      score: 5,
    });

    const { status, data } = await request('GET', `/api/trips/${trip.id}`, undefined, token);

    expect(status).toBe(200);
    expect(data.id).toBe(trip.id);
    expect(data.passenger_name).toBe('Rated Passenger');
    expect(data.passenger_phone).toBe('+5492613333333');
    expect(data.passenger_rating).toBe(4.5);
  });

  test('23. driver can send and list trip messages', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const db = getDb();
    const [passenger] = await db
      .insert(users)
      .values({ phone: '+5492614444444', full_name: 'Chat Pax', role: 'passenger' })
      .returning({ id: users.id });

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
        passenger_id: passenger.id,
      },
      token,
    );

    const sent = await request(
      'POST',
      `/api/trips/${trip.id}/messages`,
      { text: 'Voy en camino' },
      token,
    );
    expect(sent.status).toBe(200);
    expect(sent.data.text).toBe('Voy en camino');
    expect(sent.data.sender_role).toBe('driver');

    const listed = await request('GET', `/api/trips/${trip.id}/messages`, undefined, token);
    expect(listed.status).toBe(200);
    expect(listed.data.length).toBe(1);
    expect(listed.data[0].text).toBe('Voy en camino');
  });

  test('24. stranger cannot read trip messages', async () => {
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
        duration_minutes: 15,
      },
      token,
    );

    const other = await registerAndGetToken('+5492615555555', 'x');
    const { status, data } = await request(
      'GET',
      `/api/trips/${trip.id}/messages`,
      undefined,
      other,
    );
    expect(status).toBe(403);
    expect(data.error.code).toBe('FORBIDDEN');
  });

  test('25. driver cannot send message on completed trip', async () => {
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
        duration_minutes: 15,
      },
      token,
    );

    const db = getDb();
    await db.update(trips).set({ status: 'completed' }).where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/messages`,
      { text: 'hola' },
      token,
    );
    expect(status).toBe(409);
    expect(data.error.code).toBe('CHAT_CLOSED');
  });

  test('26. driver cannot send message on cancelled trip', async () => {
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
        duration_minutes: 15,
      },
      token,
    );

    const db = getDb();
    await db.update(trips).set({ status: 'cancelled' }).where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/messages`,
      { text: 'hola' },
      token,
    );
    expect(status).toBe(409);
    expect(data.error.code).toBe('CHAT_CLOSED');
  });

  test('27. collect refuses trip with non-positive total_fare (no undercharge)', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { tripId } = await completeTrip(token);
    const db = getDb();
    await db.update(trips).set({ total_fare: 0 }).where(eq(trips.id, tripId));

    const { status, data } = await request(
      'PUT',
      `/api/trips/${tripId}/collect`,
      { payment_method: 'cash' },
      token,
    );

    expect(status).toBe(500);
    expect(data.error.code).toBe('INVALID_FARE');
  });

  test('28. collect charges the frozen fare regardless of later fuel price changes', async () => {
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
        duration_minutes: 15,
      },
      token,
    );
    const frozenTotal = Number(trip.total_fare);

    const db = getDb();
    await db.insert(fuelPriceLog).values({ price: 5000, updated_by: 'test' });

    const { data: accepted } = await request(
      'POST',
      `/api/trips/${trip.id}/accept`,
      undefined,
      token,
    );
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);
    await request('POST', `/api/trips/${trip.id}/complete`, { lat: -31.88, lng: -65.02 }, token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'cash' },
      token,
    );

    expect(status).toBe(200);
    expect(data.total_due_ars).toBe(frozenTotal);
  });

  test('29. complete rejects trip whose stored distance is inconsistent with destination', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      {
        origin_lat: -31.9,
        origin_lng: -65.0,
        dest_lat: -31.7,
        dest_lng: -64.5,
        vehicle_type: 'car',
        distance_km: 1,
        duration_minutes: 5,
      },
      token,
    );

    const { data: accepted } = await request(
      'POST',
      `/api/trips/${trip.id}/accept`,
      undefined,
      token,
    );
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/complete`,
      { lat: -31.7, lng: -64.5 },
      token,
    );

    expect(status).toBe(409);
    expect(data.error.code).toBe('DISTANCE_MISMATCH');
  });

  test('30. complete rejects trip with null distance and far destination', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      {
        origin_lat: -31.9,
        origin_lng: -65.0,
        dest_lat: -31.7,
        dest_lng: -64.5,
        vehicle_type: 'car',
        distance_km: 1,
        duration_minutes: 5,
      },
      token,
    );

    const db = getDb();
    await db.update(trips).set({ distance_km: null }).where(eq(trips.id, trip.id));

    const { data: accepted } = await request(
      'POST',
      `/api/trips/${trip.id}/accept`,
      undefined,
      token,
    );
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, { lat: -31.9, lng: -65.0 }, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/complete`,
      { lat: -31.7, lng: -64.5 },
      token,
    );

    expect(status).toBe(409);
    expect(data.error.code).toBe('DISTANCE_MISMATCH');
  });

  test('31. create trip overrides client distance with server-computed distance', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { status, data } = await request(
      'POST',
      '/api/trips',
      {
        origin_lat: -31.9,
        origin_lng: -65.0,
        dest_lat: -31.7,
        dest_lng: -64.5,
        vehicle_type: 'car',
        distance_km: 0,
        duration_minutes: 5,
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.distance_km).toBeGreaterThan(0);
    expect(data.total_fare).toBeGreaterThan(0);
  });

  test('32. collect still works after passenger rating (rated status)', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { tripId } = await completeTrip(token);
    const db = getDb();
    await db.update(trips).set({ status: 'rated' }).where(eq(trips.id, tripId));

    const { status, data } = await request(
      'PUT',
      `/api/trips/${tripId}/collect`,
      { payment_method: 'cash' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBeGreaterThan(0);
  });
});
