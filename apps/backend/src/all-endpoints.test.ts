/**
 * Comprehensive endpoint smoke-test for the Lifty backend.
 * Every HTTP endpoint is called at least once.
 * Run: bun test src/all-endpoints.test.ts
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from './index';
import { getDb, resetDb } from './shared/db/client';
import { districts, drivers, users } from './shared/db/schema';
import { getRedis } from './shared/lib/redis';
import { createTestToken } from './shared/testing/utils';

let app: any;

async function truncateAll() {
  const db = getDb();
  await db.execute('DELETE FROM trip_events');
  await db.execute('DELETE FROM trips');
  await db.execute('DELETE FROM driver_locations');
  await db.execute('DELETE FROM sos_events');
  await db.execute('DELETE FROM push_tokens');
  await db.execute('DELETE FROM driver_documents');
  await db.execute('DELETE FROM vehicles');
  await db.execute('DELETE FROM payments');
  await db.execute('DELETE FROM withdrawals');
  await db.execute('DELETE FROM payout_methods');
  await db.execute('DELETE FROM drivers');
  await db.execute('DELETE FROM users');

  // Clear rate-limit Redis keys so per-IP counters reset between tests
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch {
      /* best-effort */
    }
  }
}

async function req(
  method: string,
  path: string,
  body?: object,
  token?: string,
  extraHeaders?: Record<string, string>,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (extraHeaders) Object.assign(headers, extraHeaders);
  const r = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(r);
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function register(
  phone: string,
  _password = 'testPass123',
  fullName = 'Test Driver',
): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: fullName, role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

async function registerWithUser(
  phone: string,
  _password = 'testPass123',
  fullName = 'Test Driver',
): Promise<{ token: string; userId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: fullName, role: 'driver' })
    .returning({ id: users.id });
  return { token: await createTestToken(user.id), userId: user.id };
}

async function driver(token: string): Promise<string> {
  const { data } = await req('PUT', '/api/drivers/me', { first_name: 'Test Driver' }, token);
  return data.id;
}

async function approveKyc(userId: string) {
  const db = getDb();
  await db.update(users).set({ kyc_status: 'approved' }).where(eq(users.id, userId));
  await db.update(drivers).set({ kyc_status: 'approved' }).where(eq(drivers.user_id, userId));
}

beforeAll(() => {
  app = createApp();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await truncateAll();
  resetDb();
});

// ── System ──
describe('System', () => {
  test('GET /health → 200', async () => {
    const { status } = await req('GET', '/health');
    expect(status).toBe(200);
  });
  test('GET /ready → 200|503', async () => {
    const { status } = await req('GET', '/ready');
    expect([200, 503]).toContain(status);
  });
  test('GET /metrics → 200', async () => {
    const r = new Request('http://localhost/metrics');
    const res = await app.handle(r);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('http_requests_total');
  });
  test('security headers are applied on top-level and nested routes', async () => {
    const top = await app.handle(new Request('http://localhost/health'));
    expect(top.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(top.headers.get('X-Frame-Options')).toBe('DENY');

    const nested = await app.handle(
      new Request('http://localhost/api/drivers/00000000-0000-0000-0000-000000000000/profile'),
    );
    expect(nested.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(nested.headers.get('X-Frame-Options')).toBe('DENY');
  });
});

// ── Auth ──
describe('Auth', () => {
  const pw = 'testPass123';

  test('GET /me → 200', async () => {
    const token = await register('+54926100002', pw);
    const { status, data } = await req('GET', '/api/auth/me', undefined, token);
    expect(status).toBe(200);
    expect(data.role).toBe('driver');
  });
  test('GET /me no token → 401', async () => {
    const { status } = await req('GET', '/api/auth/me');
    expect(status).toBe(401);
  });

});

// ── Drivers ──
describe('Drivers', () => {
  test('updateProfile no auth → 401', async () => {
    const { status } = await req('PUT', '/api/drivers/me', { first_name: 'TD' });
    expect(status).toBe(401);
  });
  test('updateProfile creates driver → 200', async () => {
    const { token } = await registerWithUser('+54926100101');
    const { status, data } = await req('PUT', '/api/drivers/me', { first_name: 'JP' }, token);
    expect(status).toBe(200);
    expect(data.id).toBeString();
    expect(data.message).toBe('Profile updated');
  });
  test('vehicle data without KYC → 400', async () => {
    const { token } = await registerWithUser('+54926100102');
    const { status, data } = await req(
      'PUT',
      '/api/drivers/me',
      { vehicle_brand: 'T', vehicle_model: 'C', vehicle_year: 2020, vehicle_color: 'W', vehicle_plate: 'ABC' },
      token,
    );
    expect(status).toBe(400);
    expect(data.error.code).toBe('KYC_REQUIRED');
  });
  test('vehicle registration after KYC → 200', async () => {
    const { token, userId } = await registerWithUser('+54926100103');
    await driver(token);
    await approveKyc(userId);
    const { status, data } = await req(
      'PUT',
      '/api/drivers/me',
      { vehicle_brand: 'T', vehicle_model: 'C', vehicle_year: 2020, vehicle_color: 'W', vehicle_plate: 'ABC' },
      token,
    );
    expect(status).toBe(200);
    expect(data.id).toBeString();
  });
  test('add document → 200', async () => {
    const { token, userId } = await registerWithUser('+54926100104');
    await driver(token);
    await approveKyc(userId);
    await req(
      'PUT',
      '/api/drivers/me',
      { vehicle_brand: 'T', vehicle_model: 'C', vehicle_year: 2020, vehicle_color: 'W', vehicle_plate: 'ABC' },
      token,
    );
    const { status, data } = await req(
      'POST',
      '/api/drivers/me/documents',
      { doc_type: 'license_front', file_url: 'https://x.com/a.jpg' },
      token,
    );
    expect(status).toBe(200);
    expect(data.message).toBe('Document uploaded');
  });
  test('add document invalid type → 400', async () => {
    const { token, userId } = await registerWithUser('+54926100105');
    await driver(token);
    await approveKyc(userId);
    await req(
      'PUT',
      '/api/drivers/me',
      { vehicle_brand: 'T', vehicle_model: 'C', vehicle_year: 2020, vehicle_color: 'W', vehicle_plate: 'ABC' },
      token,
    );
    const { status } = await req(
      'POST',
      '/api/drivers/me/documents',
      { doc_type: 'bad', file_url: 'https://x.com/x.jpg' },
      token,
    );
    expect(status).toBe(400);
  });
  test('status after vehicle → documents step', async () => {
    const { token, userId } = await registerWithUser('+54926100106');
    await driver(token);
    await approveKyc(userId);
    await req(
      'PUT',
      '/api/drivers/me',
      { vehicle_brand: 'T', vehicle_model: 'C', vehicle_year: 2020, vehicle_color: 'W', vehicle_plate: 'ABC' },
      token,
    );
    const { status, data } = await req('GET', '/api/drivers/me/status', undefined, token);
    expect(status).toBe(200);
    expect(data.step).toBe('documents');
  });
  test('status no driver → profile step', async () => {
    const { token } = await registerWithUser('+54926100107');
    const { status, data } = await req('GET', '/api/drivers/me/status', undefined, token);
    expect(status).toBe(200);
    expect(data.step).toBe('profile');
  });
  test('add document via JSON → 200', async () => {
    const { token, userId } = await registerWithUser('+54926100108');
    await driver(token);
    await approveKyc(userId);
    await req(
      'PUT',
      '/api/drivers/me',
      { vehicle_brand: 'T', vehicle_model: 'C', vehicle_year: 2020, vehicle_color: 'W', vehicle_plate: 'ABC' },
      token,
    );
    const { status } = await req(
      'POST',
      '/api/drivers/me/documents',
      { doc_type: 'license_front', file_url: 'https://x.com/doc.png' },
      token,
    );
    expect(status).toBe(200);
  });
  test('add document no auth → 401', async () => {
    const { status } = await req('POST', '/api/drivers/me/documents', { doc_type: 'license_front', file_url: 'https://x.com/x.png' });
    expect(status).toBe(401);
  });
});

// ── KYC ──
describe('KYC', () => {
  test('GET session no auth → 401', async () => {
    const { status } = await req('GET', '/api/kyc/session/any');
    expect(status).toBe(401);
  });
  test('GET session for valid driver → non-500', async () => {
    const token = await register('+54926100201');
    const id = await driver(token);
    const { status } = await req('GET', `/api/kyc/session/${id}`, undefined, token);
    expect(status).not.toBe(500);
  });
  test('POST webhook/didit → 401/400 (no HMAC)', async () => {
    const { token, userId } = await registerWithUser('+54926100202');
    await driver(token);
    const { status } = await req('POST', '/api/kyc/webhook/didit', {
      vendor_data: userId,
      status: 'approved',
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).not.toBe(500);
  });
});

// ── Trips ──
describe('Trips', () => {
  test('create no auth → 401', async () => {
    const { status } = await req('POST', '/api/trips/', {
      origin_lat: 1,
      origin_lng: 1,
      dest_lat: 2,
      dest_lng: 2,
      vehicle_type: 'car',
      distance_km: 5,
      duration_minutes: 15,
    });
    expect(status).toBe(401);
  });
  test('create no driver → 404', async () => {
    const token = await register('+54926100301');
    const { status } = await req(
      'POST',
      '/api/trips/',
      {
        origin_lat: -32.889,
        origin_lng: -68.845,
        dest_lat: -32.895,
        dest_lng: -68.83,
        vehicle_type: 'car',
        distance_km: 5,
        duration_minutes: 15,
      },
      token,
    );
    expect(status).toBe(404);
  });
  test('create → 200', async () => {
    const token = await register('+54926100302');
    await driver(token);
    const { status, data } = await req(
      'POST',
      '/api/trips/',
      {
        origin_lat: -32.889,
        origin_lng: -68.845,
        dest_lat: -32.895,
        dest_lng: -68.83,
        vehicle_type: 'car',
        distance_km: 5,
        duration_minutes: 15,
      },
      token,
    );
    expect(status).toBe(200);
    expect(data.status).toBe('request_received');
  });
  test('create with fare → 200', async () => {
    const token = await register('+54926100303');
    await driver(token);
    const { status, data } = await req(
      'POST',
      '/api/trips/',
      {
        origin_lat: -32.889,
        origin_lng: -68.845,
        dest_lat: -32.895,
        dest_lng: -68.83,
        vehicle_type: 'car',
        distance_km: 5,
        duration_minutes: 10,
      },
      token,
    );
    expect(status).toBe(200);
    expect(data.total_fare).toBeGreaterThan(0);
  });
  test('active → 200 null', async () => {
    const token = await register('+54926100304');
    await driver(token);
    const { status } = await req('GET', '/api/trips/active', undefined, token);
    expect(status).toBe(200);
  });
  test('history → 200 []', async () => {
    const token = await register('+54926100305');
    await driver(token);
    const { status, data } = await req('GET', '/api/trips/history', undefined, token);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });
  test('get/:id → 404 non-existent', async () => {
    const token = await register('+54926100306');
    await driver(token);
    const { status } = await req(
      'GET',
      '/api/trips/00000000-0000-0000-0000-000000000000',
      undefined,
      token,
    );
    expect(status).toBe(404);
  });
  test('state: accept → en-route → arrived', async () => {
    const token = await register('+54926100307');
    await driver(token);
    const { data: trip } = await req(
      'POST',
      '/api/trips/',
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
    const a = await req('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    expect(a.status).toBe(200);
    expect(a.data.status).toBe('accepted');
    const er = await req('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    expect(er.status).toBe(200);
    const ar = await req('POST', `/api/trips/${trip.id}/arrived`, undefined, token);
    expect(ar.status).toBe(200);
    expect(ar.data.status).toBe('waiting');
  });
  test('invalid transition → 400', async () => {
    const token = await register('+54926100308');
    await driver(token);
    const { data: trip } = await req(
      'POST',
      '/api/trips/',
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
    const a = await req('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    const { status } = await req('POST', `/api/trips/${trip.id}/start`, { verification_code: a.data.verification_code }, token);
    expect(status).toBe(400);
  });
  test('all trip mutations require auth → 401', async () => {
    const fid = '00000000-0000-0000-0000-000000000000';
    for (const action of ['accept', 'reject', 'en-route', 'complete', 'cancel']) {
      const { status } = await req('POST', `/api/trips/${fid}/${action}`);
      expect(status).toBe(401);
    }
  });
});

// ── Location ──
describe('Location', () => {
  test('update no auth → 401', async () => {
    const { status } = await req('POST', '/api/location/update', { lat: -32.889, lng: -68.845 });
    expect(status).toBe(401);
  });
  // No driver → plain Error from location service → 500
  test('update no driver → 500', async () => {
    const token = await register('+54926100401');
    const { status } = await req(
      'POST',
      '/api/location/update',
      { lat: -32.889, lng: -68.845 },
      token,
    );
    expect(status).toBe(500);
  });
  test('update → 200', async () => {
    const token = await register('+54926100402');
    await driver(token);
    const { status } = await req(
      'POST',
      '/api/location/update',
      { lat: -32.889, lng: -68.845, heading: 90 },
      token,
    );
    expect(status).toBe(200);
  });
  test('update missing → 400', async () => {
    const token = await register('+54926100403');
    await driver(token);
    const { status } = await req('POST', '/api/location/update', { lat: 1 } as any, token);
    expect(status).toBe(400);
  });
});

// ── Maps ──
describe('Maps', () => {
  test('autocomplete no auth → 401', async () => {
    const { status } = await req('GET', '/api/maps/places/autocomplete?input=test');
    expect(status).toBe(401);
  });
  test('autocomplete → 200 or service err', async () => {
    const token = await register('+54926100501');
    const { status } = await req(
      'GET',
      '/api/maps/places/autocomplete?input=Mendoza',
      undefined,
      token,
    );
    expect(status).not.toBe(500);
    expect(status).not.toBe(401);
  });
  test('geocode → 200 or service err', async () => {
    const token = await register('+54926100502');
    const { status } = await req('GET', '/api/maps/geocode?address=Mendoza', undefined, token);
    expect(status).not.toBe(500);
    expect(status).not.toBe(401);
  });
  test('directions missing → 400', async () => {
    const token = await register('+54926100503');
    const { status } = await req('GET', '/api/maps/directions?origin_lat=1', undefined, token);
    expect(status).toBe(400);
  });
  test('fare-estimate → 200 or service err', async () => {
    const token = await register('+54926100504');
    const { status } = await req(
      'POST',
      '/api/maps/fare-estimate',
      {
        origin_lat: -32.889,
        origin_lng: -68.845,
        dest_lat: -32.895,
        dest_lng: -68.83,
        vehicle_type: 'standard',
      },
      token,
    );
    expect(status).not.toBe(500);
    expect(status).not.toBe(401);
  });
});

// ── Payments ──
describe('Payments', () => {
  test('webhook/mercadopago no sig → 401 ish', async () => {
    // Manual body parsing in route may fail with app.handle()
    const { status } = await req('POST', '/api/payments/webhook/mercadopago', {
      payment_id: 'p1',
      trip_id: 't1',
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
  test('history no auth → 401', async () => {
    const { status } = await req('GET', '/api/payments/history');
    expect(status).toBe(401);
  });
  test('history → 200', async () => {
    const token = await register('+54926100601');
    await driver(token);
    const { status, data } = await req('GET', '/api/payments/history', undefined, token);
    expect(status).toBe(200);
    expect(data.payments).toBeArray();
  });
  test('withdraw no auth → 401', async () => {
    const { status } = await req('POST', '/api/payments/withdraw', {
      amount: 100,
      payout_method_id: 'x',
    });
    expect(status).toBe(401);
  });
  test('withdraw no driver → 404', async () => {
    const token = await register('+54926100602');
    const { status } = await req(
      'POST',
      '/api/payments/withdraw',
      {
        amount: 100,
        payout_method_id: '00000000-0000-0000-0000-000000000000',
      },
      token,
    );
    expect(status).toBe(404);
  });
  test('withdrawals no auth → 401', async () => {
    const { status } = await req('GET', '/api/payments/withdrawals');
    expect(status).toBe(401);
  });
  test('withdrawals → 200', async () => {
    const token = await register('+54926100603');
    await driver(token);
    const { status, data } = await req('GET', '/api/payments/withdrawals', undefined, token);
    expect(status).toBe(200);
    expect(data.withdrawals).toBeArray();
  });
});

// ── Earnings ──
describe('Earnings', () => {
  test('summary no auth → 401', async () => {
    expect((await req('GET', '/api/earnings/summary')).status).toBe(401);
  });
  test('summary → 200', async () => {
    const token = await register('+54926100701');
    await driver(token);
    const { status, data } = await req('GET', '/api/earnings/summary', undefined, token);
    expect(status).toBe(200);
    expect(data.today.earnings).toBe(0);
  });
  test('history no auth → 401', async () => {
    expect((await req('GET', '/api/earnings/history')).status).toBe(401);
  });
  test('history → 200', async () => {
    const token = await register('+54926100702');
    await driver(token);
    const { status, data } = await req('GET', '/api/earnings/history', undefined, token);
    expect(status).toBe(200);
    expect(data.items).toBeArray();
  });
  test('me/stats no auth → 401', async () => {
    expect((await req('GET', '/api/drivers/me/stats')).status).toBe(401);
  });
  test('me/stats → 200', async () => {
    const token = await register('+54926100703');
    await driver(token);
    const { status, data } = await req('GET', '/api/drivers/me/stats', undefined, token);
    expect(status).toBe(200);
    expect(data.tvf).toBe(1.0);
  });
});

// ── Ratings ──
describe('Ratings', () => {
  test('rate no auth → 401', async () => {
    const { status } = await req('POST', '/api/ratings/trips/x', { rating: 5 });
    expect(status).toBe(401);
  });
  test('rate → 404 non-existent', async () => {
    const token = await register('+54926100801');
    const { status } = await req(
      'POST',
      '/api/ratings/trips/00000000-0000-0000-0000-000000000000',
      { rating: 5 },
      token,
    );
    expect(status).toBe(404);
  });
  test('rate invalid rating → 400', async () => {
    const token = await register('+54926100802');
    const { status } = await req(
      'POST',
      '/api/ratings/trips/00000000-0000-0000-0000-000000000000',
      { rating: 6 },
      token,
    );
    expect(status).toBe(400);
  });
});

// ── SOS ──
describe('SOS', () => {
  test('create no auth → 401', async () => {
    const { status } = await req('POST', '/api/sos/', { type: 'police' });
    expect(status).toBe(401);
  });
  test('create → 200', async () => {
    const token = await register('+54926100901');
    await driver(token);
    const { status, data } = await req(
      'POST',
      '/api/sos/',
      {
        type: 'police',
        lat: -32.889,
        lng: -68.845,
      },
      token,
    );
    expect(status).toBe(200);
    expect(data.sos_id).toBeString();
  });
  test('accident no auth → 401', async () => {
    const { status } = await req('POST', '/api/sos/accident', { accident_type: 'collision' });
    expect(status).toBe(401);
  });
  test('accident → 200', async () => {
    const token = await register('+54926100902');
    await driver(token);
    const { status, data } = await req(
      'POST',
      '/api/sos/accident',
      {
        accident_type: 'collision',
        lat: -32.889,
        lng: -68.845,
      },
      token,
    );
    expect(status).toBe(200);
    expect(data.sos_id).toBeString();
  });
});

// ── Notifications ──
describe('Notifications', () => {
  test('token no auth → 401', async () => {
    const { status } = await req('POST', '/api/notifications/token', { token: 'fcm' });
    expect(status).toBe(401);
  });
  test('token → 200', async () => {
    const token = await register('+54926101001');
    const { status, data } = await req(
      'POST',
      '/api/notifications/token',
      { token: 'fcm', platform: 'android' },
      token,
    );
    expect(status).toBe(200);
    expect(data.message).toBe('Token registered');
  });
  test('delete token no auth → 401', async () => {
    const { status } = await req('DELETE', '/api/notifications/token');
    expect(status).toBe(401);
  });
  test('delete token → 200', async () => {
    const token = await register('+54926101002');
    await req('POST', '/api/notifications/token', { token: 'fcm' }, token);
    const { status } = await req('DELETE', '/api/notifications/token', undefined, token);
    expect(status).toBe(200);
  });
});

// ── Drivers ──
describe('Drivers', () => {
  test('public profile → 200', async () => {
    const token = await register('+54926101101');
    const id = await driver(token);
    const { status, data } = await req('GET', `/api/drivers/${id}/profile`);
    expect(status).toBe(200);
    expect(data.full_name).toBeDefined();
  });
  test('public profile non-existent → 404', async () => {
    // Use a valid UUID format to avoid SQL cast errors
    const { status } = await req(
      'GET',
      '/api/drivers/00000000-0000-0000-0000-000000000000/profile',
    );
    expect(status).toBe(404);
  });
  test('me no auth → 401', async () => {
    const { status } = await req('GET', '/api/drivers/me');
    expect(status).toBe(401);
  });
  test('me → 200', async () => {
    const token = await register('+54926101102');
    await driver(token);
    const { status, data } = await req('GET', '/api/drivers/me', undefined, token);
    expect(status).toBe(200);
    expect(data.full_name).toBeDefined();
  });
  test('me/online no auth → 401', async () => {
    const { status } = await req('PUT', '/api/drivers/me/online', { is_online: true });
    expect(status).toBe(401);
  });
  test('me/online → 200', async () => {
    const { token, userId } = await registerWithUser('+54926101103');
    await driver(token);
    const db = getDb();
    const [district] = await db
      .select({ id: districts.id })
      .from(districts)
      .orderBy(districts.name)
      .limit(1);
    await db
      .update(drivers)
      .set({ status: 'approved', district_id: district.id })
      .where(eq(drivers.user_id, userId));
    const { status, data } = await req('PUT', '/api/drivers/me/online', { is_online: true }, token);
    expect(status).toBe(200);
    expect(data.is_online).toBe(true);
  });
});

// ── Districts ──
describe('Districts', () => {
  test('no auth → 401', async () => {
    const { status } = await req('GET', '/api/districts/');
    expect(status).toBe(401);
  });
  test('→ 200', async () => {
    const token = await register('+54926101201');
    const { status, data } = await req('GET', '/api/districts/', undefined, token);
    expect(status).toBe(200);
    expect(data.districts).toBeArray();
  });
});

// ── Payment Methods ──
describe('Payment Methods', () => {
  test('add no auth → 401', async () => {
    const { status } = await req('POST', '/api/drivers/me/payment-methods/', {
      method_type: 'bank_transfer',
      account_number: '12345',
    });
    expect(status).toBe(401);
  });
  test('add no driver → 404', async () => {
    const token = await register('+54926101301');
    const { status } = await req(
      'POST',
      '/api/drivers/me/payment-methods/',
      {
        method_type: 'bank_transfer',
        account_number: '12345',
      },
      token,
    );
    expect(status).toBe(404);
  });
  test('add → 200', async () => {
    const token = await register('+54926101302');
    await driver(token);
    const { status, data } = await req(
      'POST',
      '/api/drivers/me/payment-methods/',
      {
        method_type: 'bank_transfer',
        account_number: '1234567890',
        titular_name: 'Test',
      },
      token,
    );
    expect(status).toBe(200);
    expect(data.id).toBeString();
  });
  test('add missing → 400', async () => {
    const token = await register('+54926101303');
    await driver(token);
    const { status } = await req(
      'POST',
      '/api/drivers/me/payment-methods/',
      { method_type: 'bt' } as any,
      token,
    );
    expect(status).toBe(400);
  });
  test('list no auth → 401', async () => {
    const { status } = await req('GET', '/api/drivers/me/payment-methods/');
    expect(status).toBe(401);
  });
  test('list → 200', async () => {
    const token = await register('+54926101304');
    await driver(token);
    await req(
      'POST',
      '/api/drivers/me/payment-methods/',
      {
        method_type: 'bank_transfer',
        account_number: '1234567890',
      },
      token,
    );
    const { status, data } = await req('GET', '/api/drivers/me/payment-methods/', undefined, token);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });
  test('delete no auth → 401', async () => {
    const { status } = await req('DELETE', '/api/drivers/me/payment-methods/x');
    expect(status).toBe(401);
  });
  test('delete → 404 non-existent', async () => {
    const token = await register('+54926101305');
    await driver(token);
    const { status } = await req(
      'DELETE',
      '/api/drivers/me/payment-methods/00000000-0000-0000-0000-000000000000',
      undefined,
      token,
    );
    expect(status).toBe(404);
  });
});

// ── 404s ──
describe('Undefined routes', () => {
  test('GET /api/nope → 404', async () => {
    expect((await req('GET', '/api/nope')).status).toBe(404);
  });
  test('POST /api/auth/nope → 404', async () => {
    expect((await req('POST', '/api/auth/nope', {})).status).toBe(404);
  });
});
