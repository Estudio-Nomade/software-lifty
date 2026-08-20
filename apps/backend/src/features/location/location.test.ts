process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { driverLocations, drivers, users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: any;
let server: any;
let port: number;

async function truncateTables() {
  const d = getDb();
  await d.delete(driverLocations);
  await d.delete(trips);
  await d.delete(drivers);
  await d.delete(users);
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

async function registerAndCreateDriver(phone: string, _password: string) {
  const db = getDb();
  const [userRow] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });

  const [driver] = await db
    .insert(drivers)
    .values({ user_id: userRow.id, status: 'approved' })
    .returning({ id: drivers.id });

  return {
    token: await createTestToken(userRow.id),
    userId: userRow.id,
    driverId: driver.id,
  };
}

function wsConnect(port: number, token: string): Promise<{ ws: WebSocket; open: boolean }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/location?token=${token}`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 15000);

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve({ ws, open: true });
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({ ws, open: false });
    };
  });
}

function wsExpectClose(port: number, token: string): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/location?token=${token}`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket close timeout'));
    }, 10000);

    ws.onclose = (event) => {
      clearTimeout(timeout);
      resolve({ code: event.code, reason: event.reason });
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({ code: 1006, reason: 'Connection error' });
    };
  });
}

async function wsSendAndWait(message: object, ws: WebSocket, driverId: string): Promise<void> {
  return new Promise((resolve) => {
    ws.send(JSON.stringify(message));
    const poll = async () => {
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const [loc] = await getDb()
          .select({ id: driverLocations.driver_id })
          .from(driverLocations)
          .where(eq(driverLocations.driver_id, driverId))
          .limit(1);
        if (loc) return resolve();
      }
      resolve();
    };
    poll();
  });
}

async function wsSendRaw(message: string, ws: WebSocket): Promise<void> {
  ws.send(message);
  await new Promise((r) => setTimeout(r, 300));
}

import { eq } from 'drizzle-orm';
import { findNearbyOnlineDrivers } from './service';
import { getDriverActiveTrip, invalidateTripCache } from '../../shared/lib/trip-utils';
import { trips } from '../../shared/db/schema';

describe('getDriverActiveTrip', () => {
  test('returns null when driver has no trips', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492619999999', full_name: 'Test', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, status: 'approved' })
      .returning({ id: drivers.id });

    invalidateTripCache(driver.id);
    const result = await getDriverActiveTrip(driver.id);
    expect(result).toBeNull();
  });

  test('returns trip when driver has active trip', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492618888888', full_name: 'Test', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, status: 'approved' })
      .returning({ id: drivers.id });
    const [trip] = await db
      .insert(trips)
      .values({
        driver_id: driver.id,
        status: 'accepted',
        origin_lat: -32.89,
        origin_lng: -68.84,
        dest_lat: -32.90,
        dest_lng: -68.85,
      })
      .returning({ id: trips.id });

    invalidateTripCache(driver.id);
    const result = await getDriverActiveTrip(driver.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(trip.id);
  });

  test('returns null for terminal trip statuses', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492617777777', full_name: 'Test', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, status: 'approved' })
      .returning({ id: drivers.id });
    await db.insert(trips).values({
      driver_id: driver.id,
      status: 'completed',
      origin_lat: -32.89,
      origin_lng: -68.84,
      dest_lat: -32.90,
      dest_lng: -68.85,
    });

    invalidateTripCache(driver.id);
    const result = await getDriverActiveTrip(driver.id);
    expect(result).toBeNull();
  });

  test('caches result and invalidates on request', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492616666666', full_name: 'Test', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, status: 'approved' })
      .returning({ id: drivers.id });
    const [trip] = await db
      .insert(trips)
      .values({
        driver_id: driver.id,
        status: 'accepted',
        origin_lat: -32.89,
        origin_lng: -68.84,
        dest_lat: -32.90,
        dest_lng: -68.85,
      })
      .returning({ id: trips.id });

    invalidateTripCache(driver.id);
    const result1 = await getDriverActiveTrip(driver.id);
    expect(result1!.id).toBe(trip.id);

    const result2 = await getDriverActiveTrip(driver.id);
    expect(result2!.id).toBe(trip.id);

    invalidateTripCache(driver.id);

    await db.update(trips).set({ status: 'completed' }).where(eq(trips.id, trip.id));

    const result3 = await getDriverActiveTrip(driver.id);
    expect(result3).toBeNull();
  });
});

beforeAll(() => {
  app = createApp();
  app.listen(0);
  port = (app.server as any)?.port;
  server = app;
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  if (server?.server) {
    server.server.stop();
    await new Promise((r) => setTimeout(r, 500));
  }
  resetDb();
});

describe('Location WebSocket', () => {
  const phone = '+5492611234567';
  const password = 'testPass123';

  test('WS connects with valid token', async () => {
    const { token } = await registerAndCreateDriver(phone, password);
    const { ws, open } = await wsConnect(port, token);
    expect(open).toBe(true);
    ws.close();
  });

  test('WS rejects connection with invalid token', async () => {
    const { code } = await wsExpectClose(port, 'invalid-token');
    expect([4001, 1006]).toContain(code);
  });

  test(
    'WS stores location on message',
    async () => {
      const { token, driverId } = await registerAndCreateDriver(phone, password);
      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendAndWait({ lat: -32.89, lng: -68.84, heading: 180 }, ws, driverId);
      ws.close();
      await new Promise((r) => setTimeout(r, 200));

      const [loc] = await getDb()
        .select()
        .from(driverLocations)
        .where(eq(driverLocations.driver_id, driverId))
        .limit(1);

      expect(loc).toBeDefined();
      expect(loc.lat).toBeCloseTo(-32.89, 1);
      expect(loc.lng).toBeCloseTo(-68.84, 1);
      expect(loc.heading).toBe(180);
    },
    { timeout: 15000 },
  );

  test('POST /api/location/update stores location', async () => {
    const { token, driverId } = await registerAndCreateDriver(phone, password);

    const { status, data } = await request(
      'POST',
      '/api/location/update',
      { lat: -34.6, lng: -58.38, heading: 270 },
      token,
    );
    expect(status).toBe(200);
    expect(data.message).toBe('Location updated');

    const [loc] = await getDb()
      .select()
      .from(driverLocations)
      .where(eq(driverLocations.driver_id, driverId))
      .limit(1);

    expect(loc).toBeDefined();
    expect(loc.lat).toBeCloseTo(-34.6, 1);
    expect(loc.lng).toBeCloseTo(-58.38, 1);
    expect(loc.heading).toBe(270);
  });

  test('POST /api/location/update without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/location/update', {
      lat: 0,
      lng: 0,
    });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test(
    'WS sends location and persists to DB',
    async () => {
      const { token, driverId } = await registerAndCreateDriver(phone, password);
      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendAndWait({ lat: 40.71, lng: -74.0 }, ws, driverId);
      ws.close();
      await new Promise((r) => setTimeout(r, 200));

      const [loc] = await getDb()
        .select()
        .from(driverLocations)
        .where(eq(driverLocations.driver_id, driverId))
        .limit(1);

      expect(loc).toBeDefined();
      expect(loc.lat).toBeCloseTo(40.71, 1);
      expect(loc.lng).toBeCloseTo(-74.0, 1);
    },
    { timeout: 15000 },
  );

  test(
    'WS close does not immediately set driver offline (grace period)',
    async () => {
      const { token, driverId } = await registerAndCreateDriver(phone, password);

      await getDb()
        .update(drivers)
        .set({ is_online: true })
        .where(eq(drivers.id, driverId));

      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendAndWait({ lat: -32.89, lng: -68.84 }, ws, driverId);

      ws.close();
      await new Promise((r) => setTimeout(r, 500));

      const [driver] = await getDb()
        .select({ is_online: drivers.is_online, last_heartbeat: drivers.last_heartbeat })
        .from(drivers)
        .where(eq(drivers.id, driverId))
        .limit(1);

      // A transient disconnect keeps the driver online; only the last-seen
      // timestamp is refreshed. Offline now happens via explicit toggle or the
      // stale-driver cleanup after the grace period.
      expect(driver!.is_online).toBe(true);
      expect(driver!.last_heartbeat).not.toBeNull();
    },
    { timeout: 15000 },
  );

  test('WS without driver row closes connection', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone, full_name: 'Test Driver', role: 'driver' })
      .returning({ id: users.id });
    const token = await createTestToken(user.id);

    const { code } = await wsExpectClose(port, token);
    expect([4001, 1006]).toContain(code);
  });

  test('WS ignores message missing lat/lng', async () => {
    const { token, driverId } = await registerAndCreateDriver(phone, password);
    const { ws, open } = await wsConnect(port, token);
    expect(open).toBe(true);

    await wsSendRaw(JSON.stringify({ foo: 'bar' }), ws);

    const [loc] = await getDb()
      .select()
      .from(driverLocations)
      .where(eq(driverLocations.driver_id, driverId))
      .limit(1);
    expect(loc).toBeUndefined();

    await wsSendAndWait({ lat: -32.89, lng: -68.84 }, ws, driverId);
    ws.close();
    await new Promise((r) => setTimeout(r, 200));

    const [validLoc] = await getDb()
      .select()
      .from(driverLocations)
      .where(eq(driverLocations.driver_id, driverId))
      .limit(1);
    expect(validLoc).toBeDefined();
  });

  test(
    'WS ignores message with non-numeric lat/lng',
    async () => {
      const { token, driverId } = await registerAndCreateDriver(phone, password);
      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendRaw(JSON.stringify({ lat: 'abc', lng: 'def' }), ws);

      const [loc] = await getDb()
        .select()
        .from(driverLocations)
        .where(eq(driverLocations.driver_id, driverId))
        .limit(1);
      expect(loc).toBeUndefined();

      await wsSendAndWait({ lat: -32.89, lng: -68.84 }, ws, driverId);
      ws.close();
      await new Promise((r) => setTimeout(r, 200));

      const [validLoc] = await getDb()
        .select()
        .from(driverLocations)
        .where(eq(driverLocations.driver_id, driverId))
        .limit(1);
      expect(validLoc).toBeDefined();
    },
    { timeout: 15000 },
  );

  test(
    'WS upsert overwrites previous location',
    async () => {
      const { token, driverId } = await registerAndCreateDriver(phone, password);
      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendAndWait({ lat: 10.0, lng: 20.0 }, ws, driverId);
      ws.close();
      await new Promise((r) => setTimeout(r, 300));

      const [first] = await getDb()
        .select()
        .from(driverLocations)
        .where(eq(driverLocations.driver_id, driverId))
        .limit(1);
      expect(first).toBeDefined();
      expect(first!.lat).toBeCloseTo(10.0, 1);
      expect(first!.lng).toBeCloseTo(20.0, 1);

      const { ws: ws2 } = await wsConnect(port, token);
      await wsSendAndWait({ lat: 30.0, lng: 40.0 }, ws2, driverId);
      ws2.close();
      await new Promise((r) => setTimeout(r, 300));

      const [second] = await getDb()
        .select()
        .from(driverLocations)
        .where(eq(driverLocations.driver_id, driverId))
        .limit(1);
      expect(second).toBeDefined();
      expect(second!.lat).toBeCloseTo(30.0, 1);
      expect(second!.lng).toBeCloseTo(40.0, 1);
      expect(second!.updated_at.getTime()).toBeGreaterThanOrEqual(first!.updated_at.getTime());
    },
    { timeout: 20000 },
  );
});

describe('findNearbyOnlineDrivers', () => {
  let phoneCounter = 0;

  async function seedDriver(params: { is_online?: boolean; lat: number; lng: number; heading?: number }) {
    const db = getDb();
    const phone = `+5492611234${String(500 + phoneCounter++).padStart(3, '0')}`;
    const [user] = await db
      .insert(users)
      .values({ phone, full_name: 'Test Driver', role: 'driver' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, is_online: params.is_online ?? true, status: 'approved' })
      .returning({ id: drivers.id });
    await db.insert(driverLocations).values({
      driver_id: driver.id,
      lat: params.lat,
      lng: params.lng,
      heading: params.heading ?? null,
    });
    return { driverId: driver.id };
  }

  test('returns online drivers within radius', async () => {
    await seedDriver({ lat: -32.89, lng: -68.84 });

    const nearby = await findNearbyOnlineDrivers(-32.89, -68.84, 5);
    expect(nearby.length).toBe(1);
    expect(nearby[0].lat).toBeCloseTo(-32.89, 1);
    expect(nearby[0].lng).toBeCloseTo(-68.84, 1);
  });

  test('excludes offline drivers', async () => {
    await seedDriver({ is_online: false, lat: -32.89, lng: -68.84 });

    const nearby = await findNearbyOnlineDrivers(-32.89, -68.84, 5);
    expect(nearby.length).toBe(0);
  });

  test('returns empty for drivers outside radius', async () => {
    await seedDriver({ lat: -32.89, lng: -68.84 });

    const nearby = await findNearbyOnlineDrivers(-34.6, -58.38, 5);
    expect(nearby.length).toBe(0);
  });

  test('returns multiple drivers within radius', async () => {
    await seedDriver({ lat: -32.89, lng: -68.84 });
    await seedDriver({ lat: -32.88, lng: -68.83 });

    const nearby = await findNearbyOnlineDrivers(-32.89, -68.84, 5);
    expect(nearby.length).toBe(2);
  });
});

describe('Broadcast on location update', () => {
  test('WS broadcast is called when driver has active trip', async () => {
    const phone = '+5492615555555';
    const { token, driverId } = await registerAndCreateDriver(phone, 'testPass123');
    const db = getDb();

    await db.insert(trips).values({
      driver_id: driverId,
      status: 'accepted',
      origin_lat: -32.89,
      origin_lng: -68.84,
      dest_lat: -32.90,
      dest_lng: -68.85,
    });

    invalidateTripCache(driverId);

    const fetchCalls: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init: any) => {
      fetchCalls.push({ url, body: JSON.parse(init.body) });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as any;

    try {
      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendAndWait({ lat: -32.89, lng: -68.84, heading: 180 }, ws, driverId);
      ws.close();
      await new Promise((r) => setTimeout(r, 500));

      const broadcastCall = fetchCalls.find(
        (c) => c.url.includes('/realtime/v1/api/broadcast'),
      );
      expect(broadcastCall).toBeDefined();
      const msg = broadcastCall.body.messages[0];
      expect(msg.topic).toMatch(/^trip:/);
      expect(msg.event).toBe('driver:location');
      expect(msg.payload.lat).toBe(-32.89);
      expect(msg.payload.lng).toBe(-68.84);
      expect(msg.payload.heading).toBe(180);
      expect(msg.payload.driver_id).toBe(driverId);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, { timeout: 15000 });

  test('WS does not broadcast when driver has no active trip', async () => {
    const phone = '+5492614444444';
    const { token, driverId } = await registerAndCreateDriver(phone, 'testPass123');

    invalidateTripCache(driverId);

    const fetchCalls: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init: any) => {
      fetchCalls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as any;

    try {
      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendAndWait({ lat: -32.89, lng: -68.84, heading: 180 }, ws, driverId);
      ws.close();
      await new Promise((r) => setTimeout(r, 500));

      const broadcastCalls = fetchCalls.filter(
        (c) => c.url?.includes('/realtime/v1/api/broadcast'),
      );
      expect(broadcastCalls.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, { timeout: 15000 });
});
