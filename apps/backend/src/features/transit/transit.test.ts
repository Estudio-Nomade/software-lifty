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
  token?: string,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
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

async function ensureDistrict(name = 'Villa Dolores'): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ id: districts.id })
    .from(districts)
    .where(eq(districts.name, name))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [d] = await db
    .insert(districts)
    .values({ name, province: 'Córdoba', status: 'active' })
    .returning({ id: districts.id });
  return d.id;
}

async function createStaff(
  role: 'admin' | 'transit',
  opts?: { transit_district_id?: string | null },
): Promise<{ userId: string; token: string; districtId: string | null }> {
  const db = getDb();
  let districtId: string | null = opts?.transit_district_id ?? null;
  if (role === 'transit' && districtId === null && opts?.transit_district_id !== null) {
    districtId = await ensureDistrict();
  }
  const [user] = await db
    .insert(users)
    .values({
      phone: `+549261${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
      email: `${role}-${Math.random().toString(36).slice(2, 8)}@lifty.test`,
      full_name: role === 'admin' ? 'Admin Ops' : 'Transit Ops',
      role,
      transit_district_id: role === 'transit' ? districtId : null,
    })
    .returning({ id: users.id });
  return { userId: user.id, token: createTestToken(user.id), districtId };
}

async function createApprovedDriver(opts?: {
  identification_status?: string;
  full_name?: string;
  document_number?: string;
  approved_days_ago?: number;
  district_id?: string;
  district_name?: string;
  plate?: string;
}): Promise<{ userId: string; driverId: string; token: string; districtId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      phone: `+549261${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
      full_name: opts?.full_name ?? 'Transit Driver',
      role: 'driver',
      kyc_status: 'approved',
      document_number: opts?.document_number ?? '30111222',
      document_number_last4: (opts?.document_number ?? '30111222').slice(-4),
    })
    .returning({ id: users.id });

  const districtId = opts?.district_id ?? (await ensureDistrict(opts?.district_name ?? 'Villa Dolores'));

  const approvedAt = opts?.approved_days_ago
    ? new Date(Date.now() - opts.approved_days_ago * 24 * 60 * 60 * 1000)
    : new Date();

  const [driver] = await db
    .insert(drivers)
    .values({
      user_id: user.id,
      status: 'approved',
      admin_review_status: 'approved',
      kyc_status: 'approved',
      documents_pending_review: false,
      identification_status: opts?.identification_status ?? 'pending_pickup',
      approved_at: approvedAt,
      admin_reviewed_at: approvedAt,
      district_id: districtId,
    })
    .returning({ id: drivers.id });

  await db.insert(vehicles).values({
    driver_id: driver.id,
    brand: 'Toyota',
    model: 'Corolla',
    year: 2020,
    color: 'Blanco',
    plate: opts?.plate ?? `AB${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    vehicle_type: 'car',
  });

  return {
    userId: user.id,
    driverId: driver.id,
    token: createTestToken(user.id),
    districtId,
  };
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

describe('Transit API JWT surface', () => {
  test('GET /api/transit/stats without token → 401', async () => {
    const { status } = await request('GET', '/api/transit/stats');
    expect(status).toBe(401);
  });

  test('GET /api/transit/stats with driver JWT → 403', async () => {
    const { token } = await createApprovedDriver();
    const { status, data } = await request('GET', '/api/transit/stats', undefined, token);
    expect(status).toBe(403);
    expect((data.error as { code?: string })?.code ?? data.error).toBeTruthy();
  });

  test('GET /api/transit/stats with transit JWT → 200 counts', async () => {
    const { token } = await createStaff('transit');
    await createApprovedDriver({ identification_status: 'pending_pickup' });
    await createApprovedDriver({
      identification_status: 'issued',
      document_number: '30999888',
      full_name: 'Issued Driver',
    });
    await createApprovedDriver({
      identification_status: 'pending_pickup',
      approved_days_ago: 35,
      document_number: '30888777',
      full_name: 'Overdue Driver',
    });

    const { status, data } = await request('GET', '/api/transit/stats', undefined, token);
    expect(status).toBe(200);
    expect(typeof data.total_drivers).toBe('number');
    expect(data.total_drivers).toBeGreaterThanOrEqual(3);
    expect(typeof data.pending_pickup).toBe('number');
    expect(typeof data.issued_this_month).toBe('number');
    expect(typeof data.suspended).toBe('number');
    expect(data.suspended as number).toBeGreaterThanOrEqual(1);
  });

  test('admin JWT can call transit stats', async () => {
    const { token } = await createStaff('admin');
    const { status } = await request('GET', '/api/transit/stats', undefined, token);
    expect(status).toBe(200);
  });

  test('GET /api/transit/drivers lists platform-approved with DNI last4', async () => {
    const { token } = await createStaff('transit');
    const { driverId } = await createApprovedDriver({
      full_name: 'Ana Perez',
      document_number: '30123456',
    });

    const { status, data } = await request('GET', '/api/transit/drivers', undefined, token);
    expect(status).toBe(200);
    const items = data.items as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(1);
    const row = items.find((i) => i.id === driverId);
    expect(row).toBeTruthy();
    expect(row!.full_name).toBe('Ana Perez');
    expect(row!.document_number_last4).toBe('3456');
    expect(row!.identification_status).toBe('pending_pickup');
    expect(row!.plate).toBeTruthy();
    expect(row!.lifty_status).toBe('approved');
  });

  test('GET /api/transit/drivers filters identification_status + q', async () => {
    const { token } = await createStaff('transit');
    await createApprovedDriver({
      full_name: 'Pending One',
      document_number: '11111111',
      identification_status: 'pending_pickup',
    });
    await createApprovedDriver({
      full_name: 'Issued Two',
      document_number: '22222222',
      identification_status: 'issued',
    });

    const filtered = await request(
      'GET',
      '/api/transit/drivers?identification_status=issued&q=Issued',
      undefined,
      token,
    );
    expect(filtered.status).toBe(200);
    const items = filtered.data.items as Array<Record<string, unknown>>;
    expect(items.every((i) => i.identification_status === 'issued')).toBe(true);
    expect(items.some((i) => i.full_name === 'Issued Two')).toBe(true);
  });

  test('GET /api/transit/drivers/:id returns bounded detail', async () => {
    const { token } = await createStaff('transit');
    const { driverId } = await createApprovedDriver({ full_name: 'Detail Driver' });

    const { status, data } = await request(
      'GET',
      `/api/transit/drivers/${driverId}`,
      undefined,
      token,
    );
    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
    expect(data.full_name).toBe('Detail Driver');
    expect(data.vehicle).toBeTruthy();
    expect((data.vehicle as { plate: string }).plate).toBeTruthy();
    // no full KYC dump / admin review notes required
    expect(data.admin_review_notes).toBeUndefined();
  });

  test('POST issue with transit JWT marks issued; driver JWT 403', async () => {
    const { token: transitToken } = await createStaff('transit');
    const { driverId, token: driverToken } = await createApprovedDriver();

    const denied = await request(
      'POST',
      `/api/transit/drivers/${driverId}/identification/issue`,
      { notes: 'should fail' },
      driverToken,
    );
    expect(denied.status).toBe(403);

    const ok = await request(
      'POST',
      `/api/transit/drivers/${driverId}/identification/issue`,
      { external_ref: 'LOTE-09-A', notes: 'mostrador' },
      transitToken,
    );
    expect(ok.status).toBe(200);
    expect(ok.data.ok).toBe(true);
    expect(ok.data.identification_status).toBe('issued');
    expect(ok.data.idempotent).toBe(false);

    const db = getDb();
    const [row] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(row!.identification_status).toBe('issued');
    expect(row!.identification_external_ref).toBe('LOTE-09-A');

    const again = await request(
      'POST',
      `/api/transit/drivers/${driverId}/identification/issue`,
      {},
      transitToken,
    );
    expect(again.status).toBe(200);
    expect(again.data.idempotent).toBe(true);
  });

  test('POST issue platform not approved → 409', async () => {
    const { token } = await createStaff('transit');
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492610000099', role: 'driver', kyc_status: 'approved' })
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
      `/api/transit/drivers/${driver.id}/identification/issue`,
      {},
      token,
    );
    expect(status).toBe(409);
    expect((data.error as { code: string }).code).toBe('PLATFORM_NOT_APPROVED');
  });

  test('transit cannot call admin pending', async () => {
    const { token } = await createStaff('transit');
    const { status } = await request('GET', '/api/admin/drivers/pending', undefined, token);
    expect(status).toBe(403);
  });

  test('GET /api/transit/districts is public and only lists districts with transit operators', async () => {
    const villaId = await ensureDistrict('Villa Dolores');
    await ensureDistrict('Nono');
    await ensureDistrict('Mina Clavero');

    // 0 operators → empty (even with active districts)
    let res = await request('GET', '/api/transit/districts');
    expect(res.status).toBe(200);
    let items = res.data.items as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items).toEqual([]);

    // 1 operator on Villa Dolores → only VD
    await createStaff('transit', { transit_district_id: villaId });
    res = await request('GET', '/api/transit/districts');
    expect(res.status).toBe(200);
    items = res.data.items as Array<Record<string, unknown>>;
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('Villa Dolores');
    expect(items[0].status).toBe('active');
    expect(items[0].id).toBe(villaId);
    expect(items.some((i) => i.name === 'Nono')).toBe(false);
    expect(items.some((i) => i.name === 'Mina Clavero')).toBe(false);
    // no secrets in payload
    expect(items.every((i) => !('email' in i) && !('password' in i))).toBe(true);

    // 2 operators same district → still 1 item
    await createStaff('transit', { transit_district_id: villaId });
    res = await request('GET', '/api/transit/districts');
    items = res.data.items as Array<Record<string, unknown>>;
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('Villa Dolores');

    // transit without district does not add a district
    await createStaff('transit', { transit_district_id: null });
    res = await request('GET', '/api/transit/districts');
    items = res.data.items as Array<Record<string, unknown>>;
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('Villa Dolores');
  });

  test('transit scoped to own district: list hides other municipality drivers', async () => {
    const villaId = await ensureDistrict('Villa Dolores');
    const nonoId = await ensureDistrict('Nono');
    const { token } = await createStaff('transit', { transit_district_id: villaId });

    const villa = await createApprovedDriver({
      full_name: 'Villa Driver',
      document_number: '40111111',
      district_id: villaId,
    });
    const nono = await createApprovedDriver({
      full_name: 'Nono Driver',
      document_number: '40222222',
      district_id: nonoId,
    });

    const { status, data } = await request('GET', '/api/transit/drivers', undefined, token);
    expect(status).toBe(200);
    const items = data.items as Array<Record<string, unknown>>;
    expect(items.some((i) => i.id === villa.driverId)).toBe(true);
    expect(items.some((i) => i.id === nono.driverId)).toBe(false);

    const otherDetail = await request(
      'GET',
      `/api/transit/drivers/${nono.driverId}`,
      undefined,
      token,
    );
    expect(otherDetail.status).toBe(404);
  });

  test('transit cannot issue identification cross-district', async () => {
    const villaId = await ensureDistrict('Villa Dolores');
    const nonoId = await ensureDistrict('Nono');
    const { token } = await createStaff('transit', { transit_district_id: villaId });
    const { driverId } = await createApprovedDriver({
      district_id: nonoId,
      document_number: '40333333',
    });

    const { status, data } = await request(
      'POST',
      `/api/transit/drivers/${driverId}/identification/issue`,
      {},
      token,
    );
    expect(status).toBe(403);
    expect((data.error as { code: string }).code).toBe('FORBIDDEN');
  });

  test('transit without district binding → 403 on stats', async () => {
    const { token } = await createStaff('transit', { transit_district_id: null });
    const { status, data } = await request('GET', '/api/transit/stats', undefined, token);
    expect(status).toBe(403);
    expect((data.error as { code: string }).code).toBe('FORBIDDEN');
  });

  test('admin without district_id sees all; with district_id filters', async () => {
    const villaId = await ensureDistrict('Villa Dolores');
    const nonoId = await ensureDistrict('Nono');
    const { token } = await createStaff('admin');
    const villa = await createApprovedDriver({
      full_name: 'Admin Villa',
      document_number: '40444444',
      district_id: villaId,
    });
    const nono = await createApprovedDriver({
      full_name: 'Admin Nono',
      document_number: '40555555',
      district_id: nonoId,
    });

    const all = await request('GET', '/api/transit/drivers', undefined, token);
    expect(all.status).toBe(200);
    const allItems = all.data.items as Array<Record<string, unknown>>;
    expect(allItems.some((i) => i.id === villa.driverId)).toBe(true);
    expect(allItems.some((i) => i.id === nono.driverId)).toBe(true);

    const filtered = await request(
      'GET',
      `/api/transit/drivers?district_id=${villaId}`,
      undefined,
      token,
    );
    expect(filtered.status).toBe(200);
    const items = filtered.data.items as Array<Record<string, unknown>>;
    expect(items.every((i) => i.district_id === villaId)).toBe(true);
    expect(items.some((i) => i.id === nono.driverId)).toBe(false);
  });

  test('GET /api/auth/me exposes transit_district_id + district_name', async () => {
    const villaId = await ensureDistrict('Villa Dolores');
    const { token } = await createStaff('transit', { transit_district_id: villaId });
    const { status, data } = await request('GET', '/api/auth/me', undefined, token);
    expect(status).toBe(200);
    expect(data.transit_district_id).toBe(villaId);
    expect(data.district_name).toBe('Villa Dolores');
    expect(data.role).toBe('transit');
  });
});
