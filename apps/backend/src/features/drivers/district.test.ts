process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { districts as districtsTable, drivers as driversTable, trips, users } from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';
let app: any;

async function truncateTables() {
  const db = getDb();
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

let districtId: string;

beforeAll(async () => {
  app = createApp(createTestAuthPlugin());
  const db = getDb();

  const existing: any = await db.execute('SELECT count(*) AS count FROM districts WHERE terms_and_conditions IS NOT NULL');
  if (Number(existing.rows[0]?.count ?? 0) === 0) {
    await db.execute(`UPDATE "districts" SET terms_and_conditions = 'Terms here', privacy_policy = 'Privacy here' WHERE name = 'Villa Dolores'`);
  }
  const [d] = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(eq(districtsTable.name, 'Villa Dolores'))
    .limit(1);
  districtId = d.id;
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

async function setupApprovedDriver(phone: string): Promise<{ token: string; driverId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });

  const token = createTestToken(user.id);

  const [driver] = await db
    .insert(driversTable)
    .values({ user_id: user.id, status: 'approved' })
    .returning({ id: driversTable.id });

  return { token, driverId: driver.id };
}

describe('Driver District', () => {
  test('PUT /drivers/me/district sets district for approved driver', async () => {
    const { token } = await setupApprovedDriver('+5492611111111');

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: districtId },
      token,
    );

    expect(status).toBe(200);
    expect(data.district_id).toBe(districtId);
    expect(data.district_name).toBe('Villa Dolores');
    expect(data.district_province).toBe('Córdoba');
  });

  test('PUT /drivers/me/district with invalid id returns 404', async () => {
    const { token } = await setupApprovedDriver('+5492612222222');

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: '00000000-0000-0000-0000-000000000000' },
      token,
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('DISTRICT_NOT_FOUND');
  });

  test('PUT /drivers/me/district twice returns 409', async () => {
    const { token } = await setupApprovedDriver('+5492613333333');

    await request('PUT', '/api/drivers/me/district', { district_id: districtId }, token);
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: districtId },
      token,
    );

    expect(status).toBe(409);
    expect(data.error.code).toBe('DISTRICT_ALREADY_SET');
  });

  test('GET /drivers/me/status returns has_district after set', async () => {
    const { token } = await setupApprovedDriver('+5492614444444');

    await request('PUT', '/api/drivers/me/district', { district_id: districtId }, token);
    const { status, data } = await request('GET', '/api/drivers/me/status', undefined, token);

    expect(status).toBe(200);
    expect(data.has_district).toBe(true);
    expect(data.district.name).toBe('Villa Dolores');
  });

  test('GET /drivers/me/status returns has_district false before set', async () => {
    const { token } = await setupApprovedDriver('+5492615555555');

    const { status, data } = await request('GET', '/api/drivers/me/status', undefined, token);

    expect(status).toBe(200);
    expect(data.has_district).toBe(false);
    expect(data.district).toBeUndefined();
  });

  test('PUT /drivers/me/district without auth returns 401', async () => {
    const { status } = await request('PUT', '/api/drivers/me/district', { district_id: districtId });

    expect(status).toBe(401);
  });
});

describe('setDistrict edge cases', () => {
  // ── NOT_APPROVED gate: driver.status !== 'approved' ──
  const nonApprovedStatuses = ['step1', 'kyc_pending', 'kyc_approved', 'pending'] as const;
  for (const status of nonApprovedStatuses) {
    test(`PUT /drivers/me/district → 400 NOT_APPROVED when driver.status='${status}'`, async () => {
      const db = getDb();
      const phone = `+5492617${status.slice(0, 4)}0001`;
      const [user] = await db
        .insert(users)
        .values({ phone, full_name: 'Test Driver', role: 'driver' })
        .returning({ id: users.id });
      const token = createTestToken(user.id);
      await db.insert(driversTable).values({ user_id: user.id, status });

      const { status: resStatus, data } = await request(
        'PUT',
        '/api/drivers/me/district',
        { district_id: districtId },
        token,
      );

      expect(resStatus).toBe(400);
      expect(data.error.code).toBe('NOT_APPROVED');
      expect(data.error.message).toBe('Debes estar aprobado para elegir un municipio');
    });
  }

  // ── Active trip: no guard exists in setDistrict ──
  // setDistrict currently does NOT check for active trips. The function has no
  // query against the trips table. This test documents the current behaviour:
  // a driver with an in-progress trip can still set their district.
  // If an active-trip guard is added later, update this test to expect rejection.
  test('PUT /drivers/me/district succeeds despite active trip (no guard)', async () => {
    const { token, driverId } = await setupApprovedDriver('+5492617000009');
    const db = getDb();

    await db.insert(trips).values({
      driver_id: driverId,
      status: 'in_progress',
      origin_lat: -31.9,
      origin_lng: -65.0,
      dest_lat: -31.88,
      dest_lng: -65.02,
      total_fare: 0,
      platform_fee: 0,
      driver_earnings: 0,
    });

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: districtId },
      token,
    );

    // Clean up trip so beforeEach (truncateTables) can cascade-delete users → drivers
    await db.delete(trips);

    expect(status).toBe(200);
    expect(data.district_id).toBe(districtId);
  });

  // ── KYC pending: setDistrict only gates on driver.status ──
  // The SELECT at service.ts:685-693 fetches only id, status, district_id.
  // driver.kyc_status is never read, so a driver with kyc_status='pending' but
  // status='approved' can set their district. This documents that behaviour.
  test('PUT /drivers/me/district succeeds when kyc_status=pending but status=approved', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492617000010', full_name: 'KYC Pending Driver', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);
    await db.insert(driversTable).values({
      user_id: user.id,
      status: 'approved',
      kyc_status: 'pending',
    });

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: districtId },
      token,
    );

    expect(status).toBe(200);
    expect(data.district_id).toBe(districtId);
    expect(data.district_name).toBe('Villa Dolores');
  });
});

describe('District — race conditions', () => {
  test('concurrent PUT same district — only one succeeds', async () => {
    const { token } = await setupApprovedDriver('+5492617000011');

    const [res1, res2] = await Promise.all([
      request('PUT', '/api/drivers/me/district', { district_id: districtId }, token),
      request('PUT', '/api/drivers/me/district', { district_id: districtId }, token),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 200);
    const conflicts = [res1, res2].filter((r) => r.status === 409);

    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].data.error.code).toBe('DISTRICT_ALREADY_SET');
    expect(successes[0].data.district_id).toBe(districtId);
  });

  test('concurrent PUT different districts — only one succeeds', async () => {
    const db = getDb();

    const [districtB] = await db
      .insert(districtsTable)
      .values({
        name: 'Race District B',
        province: 'Test Province',
        status: 'active',
        terms_and_conditions: 'Race test terms',
        privacy_policy: 'Race test privacy',
      })
      .returning({ id: districtsTable.id });

    const { token, driverId } = await setupApprovedDriver('+5492617000012');

    const [resA, resB] = await Promise.all([
      request('PUT', '/api/drivers/me/district', { district_id: districtId }, token),
      request('PUT', '/api/drivers/me/district', { district_id: districtB.id }, token),
    ]);

    const successes = [resA, resB].filter((r) => r.status === 200);
    const conflicts = [resA, resB].filter((r) => r.status === 409);

    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].data.error.code).toBe('DISTRICT_ALREADY_SET');

    const [driver] = await db
      .select({ district_id: driversTable.district_id })
      .from(driversTable)
      .where(eq(driversTable.id, driverId));

    expect(driver.district_id).toBe(successes[0].data.district_id);

    await db.delete(districtsTable).where(eq(districtsTable.id, districtB.id));
  });

  test('DB integrity — district_id points to a valid district after concurrent set', async () => {
    const { token, driverId } = await setupApprovedDriver('+5492617000013');

    await Promise.all([
      request('PUT', '/api/drivers/me/district', { district_id: districtId }, token),
      request('PUT', '/api/drivers/me/district', { district_id: districtId }, token),
    ]);

    const db = getDb();
    const [driver] = await db
      .select({ district_id: driversTable.district_id })
      .from(driversTable)
      .where(eq(driversTable.id, driverId));

    expect(driver.district_id).not.toBeNull();

    const [district] = await db
      .select({ id: districtsTable.id, name: districtsTable.name, status: districtsTable.status })
      .from(districtsTable)
      .where(eq(districtsTable.id, driver.district_id!));

    expect(district).toBeDefined();
    expect(district.status).toBe('active');
    expect(district.name).toBe('Villa Dolores');
  });
});
