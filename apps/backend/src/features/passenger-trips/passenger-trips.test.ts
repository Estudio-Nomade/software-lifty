process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
delete process.env.REDIS_URL;

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import {
  commissionPhases,
  driverLocations,
  drivers,
  fuelPriceLog,
  passengerProfiles,
  platformConfig,
  tripMessages,
  ratings,
  tripEvents,
  trips,
  users,
  vehicles,
} from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';

let app: any;
let testId = 0;

async function truncateTables() {
  const db = getDb();
  await db.delete(ratings);
  await db.delete(tripEvents);
  await db.delete(tripMessages);
  await db.delete(trips);
  await db.delete(driverLocations);
  await db.delete(vehicles);
  await db.delete(drivers);
  await db.delete(passengerProfiles);
  await db.delete(users);
  await db.delete(fuelPriceLog);
  await db.delete(commissionPhases);
  await db.delete(platformConfig);
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
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty body (e.g. null responses)
  }
  return { status: res.status, data };
}

async function createPassengerToken(): Promise<string> {
  const db = getDb();
  testId++;
  const userId = `00000000-0000-4000-8000-${String(testId).padStart(12, '0')}`;
  await db
    .insert(users)
    .values({ id: userId, phone: `+549261${String(testId).padStart(6, '0')}`, full_name: 'Test Passenger', role: 'passenger' })
    .returning();
  return createTestToken(userId);
}

async function createDriverWithLocation(passengerToken: string, lat: number, lng: number): Promise<string> {
  const db = getDb();
  testId++;
  const driverId = `00000000-0000-4001-8000-${String(testId).padStart(12, '0')}`;
  const userId = `00000000-0000-4002-8000-${String(testId).padStart(12, '0')}`;

  await db.insert(users).values({ id: userId, phone: `+549261${String(testId + 100).padStart(6, '0')}`, full_name: 'Test Driver', role: 'driver' });
  await db.insert(drivers).values({ id: driverId, user_id: userId, is_online: true, status: 'approved' });
  await db.insert(driverLocations).values({ driver_id: driverId, lat, lng });
  await db.insert(vehicles).values({
    driver_id: driverId,
    brand: 'Toyota',
    model: 'Corolla',
    year: 2024,
    color: 'Blanco',
    plate: 'ABC123',
  });

  return driverId;
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
    { name: 'Medicion', month_start: 2, month_end: 2, base_rate: 0.05 },
    { name: 'Estabilizacion', month_start: 3, month_end: 6, base_rate: 0.10 },
    { name: 'Crecimiento', month_start: 7, month_end: null, base_rate: 0.10, monthly_increment: 0.007, cap_rate: 0.15 },
  ]);
  await db.insert(fuelPriceLog).values({ price: 2100, updated_by: 'test' });
  await db.insert(platformConfig).values({ key: 'commission_start_date', value: '2026-01-01' }).onConflictDoNothing();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Passenger Trips', () => {
  const origin = { lat: -32.889, lng: -68.845 };
  const dest = { lat: -32.897, lng: -68.831 };

  async function createTrip(token: string) {
    return request('POST', '/api/passenger/trips/request', {
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      dest_lat: dest.lat,
      dest_lng: dest.lng,
      origin_address: 'Av. San Martin 1000, Mendoza',
      dest_address: 'Av. Las Heras 500, Mendoza',
      vehicle_type: 'auto',
      distance_km: 3.2,
      duration_minutes: 12,
    }, token);
  }

  test('POST /request creates a trip', async () => {
    const token = await createPassengerToken();
    const { status, data } = await createTrip(token);

    expect(status).toBe(200);
    expect(data.id).toBeTruthy();
    expect(data.status).toBe('pending');
    expect(data.driver_id).toBeNull();
    expect(data.total_fare).toBeGreaterThan(0);
    expect(data.passenger_id).toBeTruthy();
  });

  test('POST /request validates required fields', async () => {
    const token = await createPassengerToken();
    const { status, data } = await request('POST', '/api/passenger/trips/request', {
      origin_lat: origin.lat,
      origin_lng: origin.lng,
    }, token);

    expect(status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  test('POST /request succeeds for driver role (dual-role)', async () => {
    const db = getDb();
    testId++;
    const userId = `00000000-0000-4000-8000-${String(testId).padStart(12, '0')}`;
    await db.insert(users).values({ id: userId, phone: `+549261${String(testId).padStart(6, '0')}`, full_name: 'Test Driver', role: 'driver' });
    const token = createTestToken(userId);

    const { status, data } = await request('POST', '/api/passenger/trips/request', {
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      dest_lat: dest.lat,
      dest_lng: dest.lng,
      vehicle_type: 'auto',
      distance_km: 3.2,
      duration_minutes: 12,
    }, token);

    expect(status).toBe(200);
    expect(data.id).toBeTruthy();
    expect(data.passenger_id).toBe(userId);
  });

  test('GET /active returns null when no active trip', async () => {
    const token = await createPassengerToken();
    const { status, data } = await request('GET', '/api/passenger/trips/active', undefined, token);

    expect(status).toBe(200);
    expect(data).toBeNull();
  });

  test('GET /active returns active trip with driver info', async () => {
    const passengerToken = await createPassengerToken();
    const driverId = await createDriverWithLocation(passengerToken, origin.lat, origin.lng);
    const { data: trip } = await createTrip(passengerToken);

    const db = getDb();
    await db
      .update(trips)
      .set({
        driver_id: driverId,
        status: 'accepted',
        verification_code: '1234',
      })
      .where(eq(trips.id, trip.id));

    const { status, data } = await request('GET', '/api/passenger/trips/active', undefined, passengerToken);

    expect(status).toBe(200);
    expect(data.id).toBe(trip.id);
    expect(data.driver_name).toBe('Test Driver');
    expect(data.vehicle_brand).toBe('Toyota');
    expect(data.vehicle_plate).toBe('ABC123');
    expect(data.verification_code).toBe('1234');
    expect(data.driver_lat).toBe(origin.lat);
    expect(data.driver_lng).toBe(origin.lng);
  });

  test('GET /:id returns trip with events', async () => {
    const token = await createPassengerToken();
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db.insert(tripEvents).values({
      trip_id: trip.id,
      from_status: 'pending',
      to_status: 'accepted',
    });

    const { status, data } = await request('GET', `/api/passenger/trips/${trip.id}`, undefined, token);

    expect(status).toBe(200);
    expect(data.id).toBe(trip.id);
    expect(data.events.length).toBeGreaterThanOrEqual(2);
  });

  test('GET /:id returns 404 for non-existent trip', async () => {
    const token = await createPassengerToken();
    const { status } = await request('GET', '/api/passenger/trips/00000000-0000-0000-0000-000000000000', undefined, token);

    expect(status).toBe(404);
  });

  test('GET /:id returns 404 for another passenger trip', async () => {
    const token1 = await createPassengerToken();
    const { data: trip } = await createTrip(token1);

    const token2 = await createPassengerToken();
    const { status } = await request('GET', `/api/passenger/trips/${trip.id}`, undefined, token2);

    expect(status).toBe(404);
  });

  test('POST /:id/cancel cancels a pending trip', async () => {
    const token = await createPassengerToken();
    const { data: trip } = await createTrip(token);

    const { status, data } = await request('POST', `/api/passenger/trips/${trip.id}/cancel`, undefined, token);

    expect(status).toBe(200);
    expect(data.status).toBe('cancelled');
  });

  test('POST /:id/cancel cancels an en_route trip', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db.update(trips).set({ status: 'en_route', driver_id: driverId }).where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/cancel`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('cancelled');
  });

  test('POST /:id/cancel cannot cancel after driver arrived', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db.update(trips).set({ status: 'waiting', driver_id: driverId }).where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/cancel`,
      undefined,
      token,
    );

    expect(status).toBe(400);
    expect(data.error.message).toContain('waiting');
  });

  test('POST /:id/cancel cannot cancel completed trip', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db.update(trips).set({ status: 'completed', driver_id: driverId }).where(eq(trips.id, trip.id));

    const { status, data } = await request('POST', `/api/passenger/trips/${trip.id}/cancel`, undefined, token);

    expect(status).toBe(400);
    expect(data.error.message).toContain('cancel');
  });

  test('GET /active succeeds for driver role (dual-role)', async () => {
    const db = getDb();
    testId++;
    const userId = `00000000-0000-4000-8000-${String(testId).padStart(12, '0')}`;
    await db.insert(users).values({ id: userId, phone: `+549261${String(testId).padStart(6, '0')}`, full_name: 'Test Driver', role: 'driver' });
    const token = createTestToken(userId);

    const { status, data } = await request('GET', '/api/passenger/trips/active', undefined, token);

    expect(status).toBe(200);
    expect(data).toBeNull();
  });

  test('GET /history returns paginated trips', async () => {
    const token = await createPassengerToken();
    await createTrip(token);
    await createTrip(token);

    const { status, data } = await request('GET', '/api/passenger/trips/history?page=1&limit=10', undefined, token);

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  test('GET /history returns empty for new passenger', async () => {
    const token = await createPassengerToken();
    const { status, data } = await request('GET', '/api/passenger/trips/history', undefined, token);

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  test('POST /request accepts dual-role (both) user', async () => {
    const db = getDb();
    testId++;
    const userId = `00000000-0000-4000-8000-${String(testId).padStart(12, '0')}`;
    await db.insert(users).values({
      id: userId,
      phone: `+549261${String(testId).padStart(6, '0')}`,
      full_name: 'Dual Role',
      role: 'both',
    });
    const token = createTestToken(userId);

    const { status, data } = await createTrip(token);

    expect(status).toBe(200);
    expect(data.id).toBeTruthy();
    expect(data.passenger_id).toBe(userId);
  });

  test('GET /active accepts dual-role (both) user', async () => {
    const db = getDb();
    testId++;
    const userId = `00000000-0000-4000-8000-${String(testId).padStart(12, '0')}`;
    await db.insert(users).values({
      id: userId,
      phone: `+549261${String(testId).padStart(6, '0')}`,
      full_name: 'Dual Role',
      role: 'both',
    });
    const token = createTestToken(userId);

    const { status, data } = await request('GET', '/api/passenger/trips/active', undefined, token);

    expect(status).toBe(200);
    expect(data).toBeNull();
  });

  test('requestTrip assigns nearest online driver and marks trip offered', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    // matchAndBroadcast runs via setImmediate after the response; poll until assigned.
    const db = getDb();
    let assigned: (typeof trips.$inferSelect) | null = null;
    for (let i = 0; i < 40; i++) {
      const [row] = await db.select().from(trips).where(eq(trips.id, trip.id));
      if (row?.driver_id) {
        assigned = row;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(assigned).toBeTruthy();
    expect(assigned?.driver_id).toBe(driverId);
    expect(assigned?.status).toBe('offered');
    expect(assigned?.expires_at).toBeTruthy();
  });

  test('POST /:id/retry re-runs matching and assigns a driver', async () => {
    const token = await createPassengerToken();
    const { data: trip } = await createTrip(token);

    // Let the initial (no-driver) broadcast settle so the trip stays pending.
    await new Promise((resolve) => setTimeout(resolve, 100));

    await createDriverWithLocation(token, origin.lat, origin.lng);

    const { status, data } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/retry`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.drivers_found).toBe(1);
    expect(data.trip.driver_id).toBeTruthy();
    expect(data.trip.status).toBe('offered');
  });

  test('POST /:id/retry returns 400 when trip is not pending', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db.update(trips).set({ status: 'offered', driver_id: driverId }).where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/retry`,
      undefined,
      token,
    );

    expect(status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  test('POST /:id/rate rates driver and marks trip rated', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db
      .update(trips)
      .set({ status: 'completed', driver_id: driverId, updated_at: new Date() })
      .where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/rate`,
      { rating: 5, comment: 'Great ride' },
      token,
    );

    expect(status).toBe(200);
    expect(data.rating_id).toBeTruthy();
    expect(data.message).toBe('Rating submitted');

    const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
    expect(updated.status).toBe('rated');

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.rating_avg).toBe(5);

    const [ratingRow] = await db.select().from(ratings).where(eq(ratings.id, data.rating_id));
    expect(ratingRow.score).toBe(5);
    expect(ratingRow.comment).toBe('Great ride');
    expect(ratingRow.rater_id).toBe(trip.passenger_id);
    expect(ratingRow.ratee_id).toBe(driver.user_id);
  });

  test('POST /:id/rate duplicate returns 409', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db
      .update(trips)
      .set({ status: 'completed', driver_id: driverId, updated_at: new Date() })
      .where(eq(trips.id, trip.id));

    await request('POST', `/api/passenger/trips/${trip.id}/rate`, { rating: 4 }, token);
    const { status, data } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/rate`,
      { rating: 5 },
      token,
    );

    expect(status).toBe(409);
    expect(data.error.code).toBe('CONFLICT');
  });

  test('POST /:id/rate non-completed trip returns 400', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db
      .update(trips)
      .set({ status: 'accepted', driver_id: driverId, updated_at: new Date() })
      .where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/rate`,
      { rating: 3 },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
  });

  test('POST /:id/rate another passenger trip returns 404', async () => {
    const token1 = await createPassengerToken();
    const driverId = await createDriverWithLocation(token1, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token1);

    const db = getDb();
    await db
      .update(trips)
      .set({ status: 'completed', driver_id: driverId, updated_at: new Date() })
      .where(eq(trips.id, trip.id));

    const token2 = await createPassengerToken();
    const { status } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/rate`,
      { rating: 5 },
      token2,
    );

    expect(status).toBe(404);
  });

  test('passenger can send and list trip messages', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db
      .update(trips)
      .set({ status: 'accepted', driver_id: driverId })
      .where(eq(trips.id, trip.id));

    const sent = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/messages`,
      { text: 'Hola conductor' },
      token,
    );
    expect(sent.status).toBe(200);
    expect(sent.data.text).toBe('Hola conductor');
    expect(sent.data.sender_role).toBe('passenger');

    const listed = await request('GET', `/api/passenger/trips/${trip.id}/messages`, undefined, token);
    expect(listed.status).toBe(200);
    expect(listed.data.length).toBe(1);
    expect(listed.data[0].text).toBe('Hola conductor');
  });

  test('stranger cannot read or send trip messages', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db
      .update(trips)
      .set({ status: 'accepted', driver_id: driverId })
      .where(eq(trips.id, trip.id));

    const stranger = await createPassengerToken();
    const list = await request('GET', `/api/passenger/trips/${trip.id}/messages`, undefined, stranger);
    expect(list.status).toBe(403);
    expect(list.data.error.code).toBe('FORBIDDEN');

    const send = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/messages`,
      { text: 'hola' },
      stranger,
    );
    expect(send.status).toBe(403);
    expect(send.data.error.code).toBe('FORBIDDEN');
  });

  test('messages require auth', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db
      .update(trips)
      .set({ status: 'accepted', driver_id: driverId })
      .where(eq(trips.id, trip.id));

    const list = await request('GET', `/api/passenger/trips/${trip.id}/messages`);
    expect(list.status).toBe(401);

    const send = await request('POST', `/api/passenger/trips/${trip.id}/messages`, { text: 'hola' });
    expect(send.status).toBe(401);
  });

  test('messages for non-existent trip return 404', async () => {
    const token = await createPassengerToken();
    const { status } = await request(
      'GET',
      '/api/passenger/trips/00000000-0000-0000-0000-000000000000/messages',
      undefined,
      token,
    );
    expect(status).toBe(404);
  });

  test('send rejects empty/whitespace message', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db
      .update(trips)
      .set({ status: 'accepted', driver_id: driverId })
      .where(eq(trips.id, trip.id));

    const { status } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/messages`,
      { text: '   ' },
      token,
    );
    expect(status).toBe(400);
  });

  test('send rejects message over 1000 chars', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db
      .update(trips)
      .set({ status: 'accepted', driver_id: driverId })
      .where(eq(trips.id, trip.id));

    const { status } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/messages`,
      { text: 'a'.repeat(1001) },
      token,
    );
    expect(status).toBe(400);
  });

  test('cannot send message on completed trip', async () => {
    const token = await createPassengerToken();
    const driverId = await createDriverWithLocation(token, origin.lat, origin.lng);
    const { data: trip } = await createTrip(token);

    const db = getDb();
    await db
      .update(trips)
      .set({ status: 'completed', driver_id: driverId })
      .where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/passenger/trips/${trip.id}/messages`,
      { text: 'hola' },
      token,
    );
    expect(status).toBe(409);
    expect(data.error.code).toBe('CHAT_CLOSED');
  });
});
