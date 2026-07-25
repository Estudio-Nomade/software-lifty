process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
delete process.env.REDIS_URL;

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { drivers, ratings, tripEvents, trips, users } from '../../shared/db/schema';
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

beforeAll(() => {
  app = createApp(createTestAuthPlugin());
});

beforeEach(async () => {
  testId++;
  await truncateTables();
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
      undefined,
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
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

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
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

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
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

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
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/complete`,
      undefined,
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

  test('7. cancel from waiting < 5min → cancelled_early', async () => {
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
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

    const db = getDb();
    await db.update(trips).set({ waiting_since: new Date() }).where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/cancel`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('cancelled_early');
  });

  test('8. cancel from waiting >= 5min → cancelled_late', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

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
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('cancelled_late');
    expect(data.total_fare).toBeGreaterThan(0);
    expect(data.platform_fee).toBeGreaterThan(0);
    expect(data.driver_earnings).toBeGreaterThan(0);
    expect(data.driver_earnings).toBeLessThan(data.total_fare);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBeGreaterThan(0);
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
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);
    await request('POST', `/api/trips/${trip.id}/complete`, undefined, token);

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

  test('15. collect mercadopago trip sets is_collected and does NOT accumulate platform_debt', async () => {
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
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);
    await request('POST', `/api/trips/${trip.id}/complete`, undefined, token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'mercadopago' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);
    expect(data.payment_method).toBe('mercadopago');

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
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/start`, { verification_code: accepted.verification_code }, token);
    await request('POST', `/api/trips/${trip.id}/complete`, undefined, token);

    await request('PUT', `/api/trips/${trip.id}/collect`, { payment_method: 'cash' }, token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'mercadopago' },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('already collected');
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
      expect(await callCancel()).toBe(400);
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
    const arrivedRes = await apiRequest('POST', `/api/trips/${tripId}/arrived`);
    expect(arrivedRes.status).toBe(200);
    const startRes = await apiRequest('POST', `/api/trips/${tripId}/start`, { verification_code: acceptData.verification_code });
    expect(startRes.status).toBe(200);

    const callComplete = async () => {
      const res = await apiRequest('POST', `/api/trips/${tripId}/complete`);
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
});
