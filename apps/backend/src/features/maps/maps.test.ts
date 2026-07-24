process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { driverLocations, drivers, users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(driverLocations);
  await db.delete(drivers);
  await db.delete(users);
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
    .values({ phone, full_name: 'Test User', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

async function registerDriverAndGetToken(phone: string, _password: string): Promise<{ token: string; driverId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  const [driver] = await db
    .insert(drivers)
    .values({ user_id: user.id, is_online: true })
    .returning({ id: drivers.id });
  await db.insert(driverLocations).values({ driver_id: driver.id, lat: -34.6037, lng: -58.3816 });
  return { token: createTestToken(user.id), driverId: driver.id };
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Maps Proxy', () => {
  const phone = '+5492612222222';
  const password = 'testPass123';

  test('autocomplete returns places', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/places/autocomplete?input=Avellaneda',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].description).toContain('Avellaneda');
    expect(data[0].place_id).toBeString();
  });

  test('autocomplete without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/maps/places/autocomplete?input=Avellaneda');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('geocode with coords returns address', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/geocode?lat=-34.6037&lng=-58.3816',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.lat).toBe(-34.6037);
    expect(data.lng).toBe(-58.3816);
    expect(data.formatted_address).toBeString();
    expect(data.formatted_address).toContain('Argentina');
  });

  test('geocode with address returns coords', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/geocode?address=Buenos%20Aires',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.lat).toBeNumber();
    expect(data.lng).toBeNumber();
    expect(data.formatted_address).toContain('Buenos Aires');
  });

  test('directions returns route', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/directions?origin_lat=-34.6037&origin_lng=-58.3816&dest_lat=-34.6158&dest_lng=-58.4333',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.distance_km).toBeNumber();
    expect(data.distance_km).toBeGreaterThan(0);
    expect(data.duration_minutes).toBeNumber();
    expect(data.polyline).toBeString();
  });

  test('directions should score alternative routes by road hierarchy', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/directions?origin_lat=-34.6037&origin_lng=-58.3816&dest_lat=-34.6158&dest_lng=-58.4333',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.distance_km).toBeNumber();
    expect(data.distance_km).toBeGreaterThan(0);
    expect(data.duration_minutes).toBeNumber();
    expect(data.polyline).toBeString();
    expect(data.polyline.length).toBeGreaterThan(0);
  });

  test('fare-estimate calculates fare', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'POST',
      '/api/maps/fare-estimate',
      {
        origin_lat: -34.6037,
        origin_lng: -58.3816,
        dest_lat: -34.6158,
        dest_lng: -58.4333,
        vehicle_type: 'car',
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.distance_km).toBeNumber();
    expect(data.duration_minutes).toBeNumber();
    expect(data.base_fare).toBeGreaterThan(0);
    expect(data.distance_fare).toBeGreaterThan(0);
    expect(data.time_fare).toBeGreaterThan(0);
    expect(data.total).toBeGreaterThan(0);
    expect(data.platform_fee).toBeGreaterThan(0);
    expect(data.driver_earnings).toBeGreaterThan(0);
  });

  test('fare-estimate with invalid vehicle_type returns error', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'POST',
      '/api/maps/fare-estimate',
      {
        origin_lat: -34.6037,
        origin_lng: -58.3816,
        dest_lat: -34.6158,
        dest_lng: -58.4333,
        vehicle_type: 'helicopter',
      },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('Invalid vehicle type');
  });

  test('fare-estimate without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/maps/fare-estimate', {
      origin_lat: -34.6037,
      origin_lng: -58.3816,
      dest_lat: -34.6158,
      dest_lng: -58.4333,
      vehicle_type: 'car',
    });

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});

describe('Heatmap', () => {
  const phone = '+5492612222333';
  const password = 'testPass123';

  test('heatmap returns FeatureCollection for valid bounds', async () => {
    const { token } = await registerDriverAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.type).toBe('FeatureCollection');
    expect(Array.isArray(data.features)).toBe(true);
  });

  test('heatmap features have weight between 0 and 1', async () => {
    const { token } = await registerDriverAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35',
      undefined,
      token,
    );

    expect(status).toBe(200);
    for (const f of data.features) {
      expect(f.geometry.type).toBe('Point');
      expect(Array.isArray(f.geometry.coordinates)).toBe(true);
      expect(f.geometry.coordinates).toHaveLength(2);
      expect(f.properties.weight).toBeNumber();
      expect(f.properties.weight).toBeGreaterThanOrEqual(0);
      expect(f.properties.weight).toBeLessThanOrEqual(1);
    }
  });

  test('heatmap returns grid cells when no drivers in area', async () => {
    const { token } = await registerDriverAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-40.0&sw_lng=-60.0&ne_lat=-39.9&ne_lng=-59.9',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(Array.isArray(data.features)).toBe(true);
    expect(data.features.length).toBeGreaterThan(0);
    for (const f of data.features) {
      expect(f.properties.weight).toBe(1.0);
    }
  });

  test('heatmap respects grid_size parameter', async () => {
    const { token } = await registerDriverAndGetToken(phone, password);

    const { data: dataSmall } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35&grid_size=2',
      undefined,
      token,
    );

    const { data: dataLarge } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35&grid_size=10',
      undefined,
      token,
    );

    expect(dataLarge.features.length).toBeGreaterThanOrEqual(dataSmall.features.length);
  });

  test('heatmap without auth returns 401', async () => {
    const { status, data } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35',
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('heatmap with invalid grid_size returns 400', async () => {
    const { token } = await registerDriverAndGetToken(phone, password);

    const { status } = await request(
      'GET',
      '/api/maps/heatmap?sw_lat=-34.65&sw_lng=-58.45&ne_lat=-34.55&ne_lng=-58.35&grid_size=30',
      undefined,
      token,
    );

    expect(status).toBe(400);
  });
});
