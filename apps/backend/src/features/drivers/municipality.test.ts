process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { districts as districtsTable, drivers as driversTable, users } from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';
import {
  buildMunicipalityResult,
  extractLocalityFromPhotonProps,
  matchDistrict,
  normalizePlaceName,
  parseLocalityFromFormatted,
  tryHealWaitlistedMunicipality,
} from './municipality';

let app: ReturnType<typeof createApp>;

async function truncateTables() {
  const db = getDb();
  await db.delete(users);
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const data = await res.json();
  return { status: res.status, data };
}

let villaDoloresId: string;

beforeAll(async () => {
  app = createApp(createTestAuthPlugin());
  const db = getDb();
  const [d] = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(eq(districtsTable.name, 'Villa Dolores'))
    .limit(1);
  villaDoloresId = d.id;
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('municipality match helpers', () => {
  test('normalizePlaceName strips accents', () => {
    expect(normalizePlaceName('Córdoba')).toBe('cordoba');
    expect(normalizePlaceName('Villa Dolores')).toBe('villa dolores');
  });

  test('matchDistrict finds Villa Dolores', () => {
    const candidates = [
      { id: '1', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
      { id: '2', name: 'Mina Clavero', province: 'Córdoba', status: 'active' },
    ];
    const m = matchDistrict('Villa Dolores', 'Córdoba', candidates);
    expect(m?.id).toBe('1');
  });

  test('matchDistrict waitlists Córdoba capital', () => {
    const candidates = [
      { id: '1', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    expect(matchDistrict('Córdoba', 'Córdoba', candidates)).toBeNull();
  });

  test('parseLocalityFromFormatted', () => {
    const p = parseLocalityFromFormatted('San Martín 123, Villa Dolores, Córdoba, Argentina');
    expect(p.city).toBe('Villa Dolores');
    expect(p.province).toBe('Córdoba');
  });

  test('buildMunicipalityResult operational vs waitlisted', () => {
    const op = buildMunicipalityResult(
      'Calle 1, Villa Dolores',
      { lat: -31.9, lng: -65.1, city: 'Villa Dolores', province: 'Córdoba' },
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    );
    expect(op.municipality_status).toBe('operational');
    expect(op.intended_district_id).toBe('vd');

    const wl = buildMunicipalityResult(
      'Calle 1, Córdoba',
      { lat: -31.4, lng: -64.1, city: 'Córdoba', province: 'Córdoba' },
      null,
    );
    expect(wl.municipality_status).toBe('waitlisted');
    expect(wl.intended_district_id).toBeNull();
  });

  test('extractLocality skips pedanía county when city present', () => {
    const loc = extractLocalityFromPhotonProps({
      city: 'Villa Dolores',
      county: 'Pedanía Dolores',
      state: 'Córdoba',
    });
    expect(loc.city).toBe('Villa Dolores');
    expect(loc.province).toBe('Córdoba');
  });

  test('extractLocality uses pedanía county as last resort (aliasable)', () => {
    const loc = extractLocalityFromPhotonProps({
      county: 'Pedanía Dolores',
      state: 'Córdoba',
    });
    expect(loc.city).toBe('Pedanía Dolores');
    expect(loc.province).toBe('Córdoba');
  });

  test('matchDistrict: Pedanía Dolores + Córdoba → Villa Dolores', () => {
    const candidates = [
      { id: '1', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
      { id: '2', name: 'Mina Clavero', province: 'Córdoba', status: 'active' },
    ];
    const m = matchDistrict('Pedanía Dolores', 'Córdoba', candidates);
    expect(m?.id).toBe('1');
    expect(m?.name).toBe('Villa Dolores');
  });

  test('matchDistrict: empty city, formatted with Villa Dolores → match', () => {
    const candidates = [
      { id: '1', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    const m = matchDistrict(null, null, candidates, 'San Martín 50, Villa Dolores, Córdoba');
    expect(m?.id).toBe('1');
  });

  test('matchDistrict: only county pedanía + address line VD → operational path', () => {
    const candidates = [
      { id: '1', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    const m = matchDistrict(
      'Pedanía Dolores',
      'Córdoba',
      candidates,
      'Belgrano 100, Pedanía Dolores, Córdoba',
    );
    expect(m?.name).toBe('Villa Dolores');
  });

  test('matchDistrict still waitlists Córdoba capital', () => {
    const candidates = [
      { id: '1', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    expect(matchDistrict('Córdoba', 'Córdoba', candidates)).toBeNull();
    expect(
      matchDistrict('Córdoba', 'Córdoba', candidates, 'Av Colón 500, Córdoba capital'),
    ).toBeNull();
  });

  test('parseLocalityFromFormatted prefers Villa Dolores over Pedanía token', () => {
    const p = parseLocalityFromFormatted(
      'San Martín 123, Pedanía Dolores, Córdoba, Argentina',
    );
    expect(p.city).toBe('Villa Dolores');
    expect(p.province).toBe('Córdoba');
  });

  test('tryHealWaitlistedMunicipality upgrades pedanía waitlist', () => {
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    const healed = tryHealWaitlistedMunicipality(
      'Calle Falsa 123, Pedanía Dolores, Córdoba',
      'Pedanía Dolores',
      'Córdoba',
      -31.94,
      -65.18,
      candidates,
    );
    expect(healed?.municipality_status).toBe('operational');
    expect(healed?.intended_district_id).toBe('vd');
    expect(healed?.address_resolved_city).toBe('Villa Dolores');
  });

  test('tryHealWaitlistedMunicipality leaves Córdoba capital waitlisted', () => {
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    expect(
      tryHealWaitlistedMunicipality(
        'Av Colón 1, Córdoba',
        'Córdoba',
        'Córdoba',
        -31.4,
        -64.1,
        candidates,
      ),
    ).toBeNull();
  });
});

describe('Driver address municipality eligibility', () => {
  test('PUT /drivers/me with Villa Dolores address → operational + intended_district_id', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492619000001', full_name: 'Addr Driver', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Juan',
        last_name: 'Perez',
        phone: '+5492619000001',
        address_line: 'San Martín 123, Villa Dolores, Córdoba',
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.municipality_status).toBe('operational');
    expect(data.intended_district_id).toBe(villaDoloresId);
    expect(data.address_resolved_city).toBe('Villa Dolores');

    const statusRes = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.municipality_status).toBe('operational');
    expect(statusRes.data.intended_district_id).toBe(villaDoloresId);
    expect(statusRes.data.show_municipality_waitlist_banner).toBe(false);
    expect(statusRes.data.intended_district_name).toBe('Villa Dolores');
  });

  test('PUT /drivers/me with Córdoba capital → waitlisted', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492619000002', full_name: 'Wait Driver', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Ana',
        last_name: 'Lopez',
        phone: '+5492619000002',
        address_line: 'Av Colón 500, Córdoba capital',
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.municipality_status).toBe('waitlisted');
    expect(data.intended_district_id).toBeNull();

    const statusRes = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(statusRes.data.municipality_status).toBe('waitlisted');
    expect(statusRes.data.show_municipality_waitlist_banner).toBe(true);
  });

  test('waitlisted driver cannot go online → MUNICIPALITY_NOT_ENABLED', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492619000003', full_name: 'Online Block', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const [driver] = await db
      .insert(driversTable)
      .values({
        user_id: user.id,
        status: 'approved',
        municipality_status: 'waitlisted',
        address_line: 'Córdoba capital',
        address_resolved_city: 'Córdoba',
        identification_status: 'issued',
      })
      .returning({ id: driversTable.id });

    // Need district for other gates — still blocked by municipality
    await db
      .update(driversTable)
      .set({ district_id: villaDoloresId })
      .where(eq(driversTable.id, driver.id));

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );

    expect(status).toBe(403);
    expect(data.error.code).toBe('MUNICIPALITY_NOT_ENABLED');
  });

  test('step1 without address returns ADDRESS_REQUIRED', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492619000004', full_name: 'No Addr', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Sin',
        last_name: 'Domicilio',
        phone: '+5492619000004',
      },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('ADDRESS_REQUIRED');
  });

  test('GET /drivers/me/status heals waitlisted Pedanía Dolores → operational', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492619000005', full_name: 'Heal Driver', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    await db.insert(driversTable).values({
      user_id: user.id,
      status: 'approved',
      municipality_status: 'waitlisted',
      address_line: 'San Martín 10, Pedanía Dolores, Córdoba',
      address_resolved_city: 'Pedanía Dolores',
      address_resolved_province: 'Córdoba',
      address_lat: -31.9456,
      address_lng: -65.1895,
      identification_status: 'issued',
    });

    const statusRes = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.municipality_status).toBe('operational');
    expect(statusRes.data.intended_district_id).toBe(villaDoloresId);
    expect(statusRes.data.show_municipality_waitlist_banner).toBe(false);
    expect(statusRes.data.address_resolved_city).toBe('Villa Dolores');

    const [row] = await db
      .select({
        municipality_status: driversTable.municipality_status,
        intended_district_id: driversTable.intended_district_id,
      })
      .from(driversTable)
      .where(eq(driversTable.user_id, user.id))
      .limit(1);
    expect(row.municipality_status).toBe('operational');
    expect(row.intended_district_id).toBe(villaDoloresId);
  });
});
