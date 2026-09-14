process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.SUPABASE_URL = '';
process.env.TRANSIT_BRIDGE_SECRET = 'test-transit-bridge-secret-dev-only';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { districts, driverDocuments, drivers, users, vehicles } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: ReturnType<typeof createApp>;

async function truncateTables() {
  const db = getDb();
  await db.delete(driverDocuments);
  await db.delete(vehicles);
  await db.delete(drivers);
  await db.delete(users);
}

async function request(
  method: string,
  path: string,
  body?: object,
  headers?: Record<string, string>,
) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data: data as Record<string, unknown> };
}

async function createApprovedDriverWithDistrict(): Promise<{
  userId: string;
  driverId: string;
  token: string;
}> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      phone: `+549261${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
      full_name: 'Bridge Driver',
      role: 'driver',
      kyc_status: 'approved',
    })
    .returning({ id: users.id });

  let districtId: string | undefined;
  const existingDistricts = await db.select({ id: districts.id }).from(districts).limit(1);
  if (existingDistricts[0]) {
    districtId = existingDistricts[0].id;
  } else {
    const [d] = await db
      .insert(districts)
      .values({ name: 'Test District', province: 'Mendoza', status: 'active' })
      .returning({ id: districts.id });
    districtId = d.id;
  }

  const [driver] = await db
    .insert(drivers)
    .values({
      user_id: user.id,
      status: 'approved',
      admin_review_status: 'approved',
      kyc_status: 'approved',
      documents_pending_review: false,
      identification_status: 'pending_pickup',
      district_id: districtId,
    })
    .returning({ id: drivers.id });

  return {
    userId: user.id,
    driverId: driver.id,
    token: createTestToken(user.id),
  };
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateTables();
  process.env.TRANSIT_BRIDGE_SECRET = 'test-transit-bridge-secret-dev-only';
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Transit bridge identification issue', () => {
  test('without secret returns 401', async () => {
    const { driverId } = await createApprovedDriverWithDistrict();
    const { status, data } = await request('POST', '/api/internal/transit/identification/issue', {
      driver_id: driverId,
    });
    expect(status).toBe(401);
    expect((data.error as { code: string }).code).toBe('UNAUTHORIZED');
  });

  test('wrong secret returns 401', async () => {
    const { driverId } = await createApprovedDriverWithDistrict();
    const { status, data } = await request(
      'POST',
      '/api/internal/transit/identification/issue',
      { driver_id: driverId },
      { Authorization: 'Bearer wrong-secret' },
    );
    expect(status).toBe(401);
    expect((data.error as { code: string }).code).toBe('UNAUTHORIZED');
  });

  test('missing env secret fail-closed 503', async () => {
    const prev = process.env.TRANSIT_BRIDGE_SECRET;
    delete process.env.TRANSIT_BRIDGE_SECRET;
    const { driverId } = await createApprovedDriverWithDistrict();
    const { status, data } = await request(
      'POST',
      '/api/internal/transit/identification/issue',
      { driver_id: driverId },
      { Authorization: 'Bearer anything' },
    );
    process.env.TRANSIT_BRIDGE_SECRET = prev;
    expect(status).toBe(503);
    expect((data.error as { code: string }).code).toBe('BRIDGE_NOT_CONFIGURED');
  });

  test('unknown driver 404', async () => {
    const { status, data } = await request(
      'POST',
      '/api/internal/transit/identification/issue',
      { driver_id: '00000000-0000-4000-8000-000000000099' },
      { Authorization: 'Bearer test-transit-bridge-secret-dev-only' },
    );
    expect(status).toBe(404);
    expect((data.error as { code: string }).code).toBe('NOT_FOUND');
  });

  test('driver JWT cannot issue', async () => {
    const { driverId, token } = await createApprovedDriverWithDistrict();
    const { status, data } = await request(
      'POST',
      '/api/internal/transit/identification/issue',
      { driver_id: driverId },
      { Authorization: `Bearer ${token}` },
    );
    expect(status).toBe(401);
    expect((data.error as { code: string }).code).toBe('UNAUTHORIZED');
  });

  test('platform not approved → 409 PLATFORM_NOT_APPROVED', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492611110001', role: 'driver', kyc_status: 'approved' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({
        user_id: user.id,
        status: 'review',
        admin_review_status: 'pending',
        identification_status: 'pending_pickup',
      })
      .returning({ id: drivers.id });

    const { status, data } = await request(
      'POST',
      '/api/internal/transit/identification/issue',
      { driver_id: driver.id },
      { Authorization: 'Bearer test-transit-bridge-secret-dev-only' },
    );
    expect(status).toBe(409);
    expect((data.error as { code: string }).code).toBe('PLATFORM_NOT_APPROVED');
  });

  test('happy path issue + X-Transit-Bridge-Secret header', async () => {
    const { driverId } = await createApprovedDriverWithDistrict();
    const { status, data } = await request(
      'POST',
      '/api/internal/transit/identification/issue',
      { driver_id: driverId, external_ref: 'transit-ticket-1' },
      { 'X-Transit-Bridge-Secret': 'test-transit-bridge-secret-dev-only' },
    );
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.identification_status).toBe('issued');
    expect(data.driver_id).toBe(driverId);

    const db = getDb();
    const [row] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(row!.identification_status).toBe('issued');
    expect(row!.identification_external_ref).toBe('transit-ticket-1');
    expect(row!.identification_issued_at).toBeTruthy();
  });

  test('idempotent re-issue returns 200', async () => {
    const { driverId } = await createApprovedDriverWithDistrict();
    const headers = { Authorization: 'Bearer test-transit-bridge-secret-dev-only' };
    const first = await request(
      'POST',
      '/api/internal/transit/identification/issue',
      { driver_id: driverId },
      headers,
    );
    expect(first.status).toBe(200);
    const second = await request(
      'POST',
      '/api/internal/transit/identification/issue',
      { driver_id: driverId },
      headers,
    );
    expect(second.status).toBe(200);
    expect(second.data.identification_status).toBe('issued');
    expect(second.data.idempotent).toBe(true);
  });

  test('approve → online STICKERS_REQUIRED → issue → online OK', async () => {
    const { driverId, token } = await createApprovedDriverWithDistrict();

    const blocked = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      { Authorization: `Bearer ${token}` },
    );
    expect(blocked.status).toBe(409);
    expect((blocked.data.error as { code: string }).code).toBe('STICKERS_REQUIRED');

    const issue = await request(
      'POST',
      '/api/internal/transit/identification/issue',
      { driver_id: driverId },
      { Authorization: 'Bearer test-transit-bridge-secret-dev-only' },
    );
    expect(issue.status).toBe(200);

    const online = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      { Authorization: `Bearer ${token}` },
    );
    expect(online.status).toBe(200);
    expect(online.data.is_online).toBe(true);
  });

  test('GET status exposes identification_status', async () => {
    const { token } = await createApprovedDriverWithDistrict();
    const { status, data } = await request('GET', '/api/drivers/me/status', undefined, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(200);
    expect(data.identification_status).toBe('pending_pickup');
    expect(data.can_go_online).toBe(false);
  });
});
