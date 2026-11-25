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
  matchDistrict,
  MAX_GPS_ACCURACY_M,
  normalizePlaceName,
  parseLocalityFromFormatted,
  resolveDistrictForAddress,
  resolveDistrictForMarket,
  resolveTerritoryFromCoords,
  tryHealWaitlistedMunicipality,
} from './municipality';
import {
  LEGACY_VD_MARKET,
  setActiveServiceMarkets,
  type ServiceMarketGeo,
} from '../../shared/lib/service-area';

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
let sanPedroId: string;
let villaSarmientoId: string;

beforeAll(async () => {
  app = createApp(createTestAuthPlugin());
  const db = getDb();

  // Launch cluster SP/VS: ensure active rows (migration 0054 may already apply).
  await db.execute(`
    INSERT INTO "districts" (name, province, status, terms_and_conditions, privacy_policy)
    SELECT 'San Pedro', 'Córdoba', 'active', 'Terms SP', 'Privacy SP'
    WHERE NOT EXISTS (SELECT 1 FROM "districts" WHERE name = 'San Pedro' AND province = 'Córdoba')
  `);
  await db.execute(`
    UPDATE "districts"
    SET status = 'active',
        terms_and_conditions = COALESCE(terms_and_conditions, 'Terms SP'),
        privacy_policy = COALESCE(privacy_policy, 'Privacy SP')
    WHERE name = 'San Pedro' AND province = 'Córdoba'
  `);
  await db.execute(`
    INSERT INTO "districts" (name, province, status, terms_and_conditions, privacy_policy)
    SELECT 'Villa Sarmiento', 'Córdoba', 'active', 'Terms VS', 'Privacy VS'
    WHERE NOT EXISTS (SELECT 1 FROM "districts" WHERE name = 'Villa Sarmiento' AND province = 'Córdoba')
  `);
  await db.execute(`
    UPDATE "districts"
    SET status = 'active',
        terms_and_conditions = COALESCE(terms_and_conditions, 'Terms VS'),
        privacy_policy = COALESCE(privacy_policy, 'Privacy VS')
    WHERE name = 'Villa Sarmiento' AND province = 'Córdoba'
  `);

  const [d] = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(eq(districtsTable.name, 'Villa Dolores'))
    .limit(1);
  villaDoloresId = d.id;

  const [sp] = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(eq(districtsTable.name, 'San Pedro'))
    .limit(1);
  sanPedroId = sp.id;

  const [vs] = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(eq(districtsTable.name, 'Villa Sarmiento'))
    .limit(1);
  villaSarmientoId = vs.id;
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

  test('resolveTerritoryFromCoords: Pedanía Dolores geocoder label + hub pin → operational VD', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET]);
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    const r = resolveTerritoryFromCoords(-31.945, -65.1902, candidates, {
      addressLine: 'Villa Dolores, Córdoba, Argentina',
      geocoderCity: 'Pedanía Dolores',
      geocoderProvince: 'Córdoba',
    });
    expect(r.municipality_status).toBe('operational');
    expect(r.resolution_method).toBe('service_market_hub');
    expect(r.address_resolved_city).toBe('Villa Dolores');
    expect(r.geocoder_city).toBe('Pedanía Dolores');
    expect(r.intended_district_id).toBe('vd');
  });

  test('resolveTerritoryFromCoords: Photon department label ignored for gate', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET]);
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    const r = resolveTerritoryFromCoords(-31.945, -65.1902, candidates, {
      geocoderCity: 'Departamento San Javier',
      geocoderProvince: 'Córdoba',
    });
    expect(r.municipality_status).toBe('operational');
    expect(r.address_resolved_city).toBe('Villa Dolores');
  });

  test('resolveTerritoryFromCoords: outside all markets → waitlisted', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET]);
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    const r = resolveTerritoryFromCoords(-31.4, -64.1, candidates, {
      geocoderCity: 'Córdoba',
      geocoderProvince: 'Córdoba',
    });
    expect(r.municipality_status).toBe('waitlisted');
    expect(r.resolution_method).toBe('none');
    expect(r.intended_district_id).toBeNull();
  });

  test('resolveTerritoryFromCoords: accuracy too poor → unresolved', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET]);
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    const r = resolveTerritoryFromCoords(-31.945, -65.1902, candidates, {
      accuracyM: MAX_GPS_ACCURACY_M + 1,
    });
    expect(r.municipality_status).toBe('unresolved');
    expect(r.resolution_method).toBe('accuracy_insufficient');
  });

  test('resolveTerritoryFromCoords: Tandil market pin → operational Tandil', () => {
    const tandil: ServiceMarketGeo = {
      id: 'm-ta',
      slug: 'tandil',
      name: 'Tandil',
      province: 'Buenos Aires',
      status: 'active',
      hub_lat: -37.3217,
      hub_lng: -59.1332,
      pickup_radius_km: 8,
      dropoff_radius_km: 50,
      match_radius_km: 8,
      geo_bias_radius_km: 20,
      default_district_id: 'ta',
    };
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandil]);
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
      { id: 'ta', name: 'Tandil', province: 'Buenos Aires', status: 'active' },
    ];
    const r = resolveTerritoryFromCoords(-37.327, -59.1386, candidates, {
      geocoderCity: 'Some barrio',
      geocoderProvince: 'Buenos Aires',
    });
    expect(r.municipality_status).toBe('operational');
    expect(r.intended_district_id).toBe('ta');
    expect(r.address_resolved_city).toBe('Tandil');
    expect(r.service_market_id).toBe('m-ta');
  });

  test('resolveDistrictForAddress is coords-first (ignores bad Photon city)', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET]);
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    const m = resolveDistrictForAddress(
      'Pedanía Dolores',
      'Córdoba',
      candidates,
      -31.945,
      -65.1902,
    );
    expect(m?.id).toBe('vd');
  });

  test('tryHealWaitlistedMunicipality: Pedanía Dolores hub pin → operational', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET]);
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    const healed = tryHealWaitlistedMunicipality(
      {
        address_line: 'Villa Dolores, Córdoba, Argentina',
        address_lat: -31.945,
        address_lng: -65.1902,
        address_resolved_city: 'Pedanía Dolores',
        address_resolved_province: 'Córdoba',
        geocoder_city: 'Pedanía Dolores',
      },
      candidates,
    );
    expect(healed?.municipality_status).toBe('operational');
    expect(healed?.intended_district_id).toBe('vd');
    expect(healed?.address_resolved_city).toBe('Villa Dolores');
  });

  test('tryHealWaitlistedMunicipality: outside pickup stays null', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET]);
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    const healed = tryHealWaitlistedMunicipality(
      {
        address_line: 'Córdoba capital',
        address_lat: -31.4,
        address_lng: -64.1,
        address_resolved_city: 'Córdoba',
        address_resolved_province: 'Córdoba',
      },
      candidates,
    );
    expect(healed).toBeNull();
  });

  test('resolveDistrictForMarket uses default_district_id', () => {
    const market: ServiceMarketGeo = {
      ...LEGACY_VD_MARKET,
      default_district_id: 'vd-custom',
    };
    const candidates = [
      { id: 'vd-custom', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
      { id: 'other', name: 'Other', province: 'Córdoba', status: 'active' },
    ];
    expect(resolveDistrictForMarket(market, candidates)?.id).toBe('vd-custom');
  });

  test('matchDistrict waitlists Córdoba capital', () => {
    const candidates = [
      { id: '1', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    expect(matchDistrict('Córdoba', 'Córdoba', candidates)).toBeNull();
  });

  test('matchDistrict finds San Pedro (Córdoba)', () => {
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
      { id: 'sp', name: 'San Pedro', province: 'Córdoba', status: 'active' },
      { id: 'vs', name: 'Villa Sarmiento', province: 'Córdoba', status: 'active' },
    ];
    const m = matchDistrict('San Pedro', 'Córdoba', candidates);
    expect(m?.id).toBe('sp');
  });

  test('matchDistrict finds Villa Sarmiento (Córdoba)', () => {
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
      { id: 'sp', name: 'San Pedro', province: 'Córdoba', status: 'active' },
      { id: 'vs', name: 'Villa Sarmiento', province: 'Córdoba', status: 'active' },
    ];
    const m = matchDistrict('Villa Sarmiento', 'Córdoba', candidates);
    expect(m?.id).toBe('vs');
  });

  test('matchDistrict resolves v sarmiento alias', () => {
    const candidates = [
      { id: 'vs', name: 'Villa Sarmiento', province: 'Córdoba', status: 'active' },
    ];
    const m = matchDistrict('V Sarmiento', 'Córdoba', candidates);
    expect(m?.id).toBe('vs');
  });

  test('matchDistrict resolves S Pedro / San Pedro Córdoba aliases', () => {
    const candidates = [
      { id: 'sp', name: 'San Pedro', province: 'Córdoba', status: 'active' },
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    expect(matchDistrict('S Pedro', 'Córdoba', candidates)?.id).toBe('sp');
    expect(matchDistrict('San Pedro Córdoba', 'Córdoba', candidates)?.id).toBe('sp');
    expect(matchDistrict('S. Pedro', 'Córdoba', candidates)?.id).toBe('sp');
  });

  test('parseLocalityFromFormatted', () => {
    const p = parseLocalityFromFormatted('San Martín 123, Villa Dolores, Córdoba, Argentina');
    expect(p.city).toBe('Villa Dolores');
    expect(p.province).toBe('Córdoba');
  });

  test('buildMunicipalityResult operational vs waitlisted', () => {
    // Hub VD coords (inside pickup 8 km)
    const op = buildMunicipalityResult(
      'Calle 1, Villa Dolores',
      { lat: -31.9449464, lng: -65.1905677, city: 'Villa Dolores', province: 'Córdoba' },
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

  test('buildMunicipalityResult: district name match + coords outside pickup → waitlisted', () => {
    // ~13 km east of hub (Rosas-like) — name says Villa Dolores but pin is outside 8 km
    const latRad = (-31.9449464 * Math.PI) / 180;
    const degPerKm = 1 / (111.32 * Math.cos(latRad));
    const farLat = -31.9449464;
    const farLng = -65.1905677 + 13 * degPerKm;

    const spoof = buildMunicipalityResult(
      'Calle Falsa 123, Villa Dolores, Córdoba',
      { lat: farLat, lng: farLng, city: 'Villa Dolores', province: 'Córdoba' },
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    );
    expect(spoof.municipality_status).toBe('waitlisted');
    expect(spoof.intended_district_id).toBeNull();
    expect(spoof.address_lat).toBe(farLat);
    expect(spoof.address_lng).toBe(farLng);
  });

  test('buildMunicipalityResult: CABA coords + VD name match → waitlisted', () => {
    const spoof = buildMunicipalityResult(
      'Av Siempre Viva, Villa Dolores',
      { lat: -34.6037, lng: -58.3816, city: 'Villa Dolores', province: 'Córdoba' },
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    );
    expect(spoof.municipality_status).toBe('waitlisted');
    expect(spoof.intended_district_id).toBeNull();
  });

  test('buildMunicipalityResult: SP coords inside VD fence → operational via market (not Photon city)', () => {
    setActiveServiceMarkets([LEGACY_VD_MARKET]);
    // San Pedro pin is within VD 8km hub — fence is market, not Photon city.
    const op = buildMunicipalityResult(
      'Belgrano 50, San Pedro, Córdoba',
      { lat: -31.936553, lng: -65.2189268, city: 'San Pedro', province: 'Córdoba' },
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    );
    expect(op.municipality_status).toBe('operational');
    expect(op.resolution_method).toBe('service_market_hub');
    expect(op.address_resolved_city).toBe('Villa Dolores');
    expect(op.geocoder_city).toBe('San Pedro');
  });

  test('resolveDistrictForAddress: Tandil pin falls back to market name when city empty', () => {
    const tandilMarket: ServiceMarketGeo = {
      id: 'm-tandil',
      slug: 'tandil',
      name: 'Tandil',
      province: 'Buenos Aires',
      status: 'active',
      hub_lat: -37.3217,
      hub_lng: -59.1332,
      pickup_radius_km: 8,
      dropoff_radius_km: 50,
      match_radius_km: 8,
      geo_bias_radius_km: 20,
    };
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandilMarket]);

    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
      { id: 'td', name: 'Tandil', province: 'Buenos Aires', status: 'active' },
    ];

    // Photon miss: city null — still resolve via pickup market name.
    const match = resolveDistrictForAddress(null, null, candidates, -37.32515, -59.13572);
    expect(match?.id).toBe('td');

    const op = buildMunicipalityResult(
      '9 de Julio 658, Tandil, Buenos Aires',
      { lat: -37.32515, lng: -59.13572, city: null, province: null },
      match,
    );
    expect(op.municipality_status).toBe('operational');
    expect(op.intended_district_id).toBe('td');
    expect(op.intended_district_name).toBe('Tandil');
  });

  test('resolveDistrictForAddress: without coords never uses Photon city alone', () => {
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
      { id: 'td', name: 'Tandil', province: 'Buenos Aires', status: 'active' },
    ];
    const match = resolveDistrictForAddress('Tandil', 'Buenos Aires', candidates, null, null);
    expect(match).toBeNull();
  });

  test('resolveDistrictForAddress: no Tandil district → null even inside hub', () => {
    const tandilMarket: ServiceMarketGeo = {
      id: 'm-tandil',
      slug: 'tandil',
      name: 'Tandil',
      province: 'Buenos Aires',
      status: 'active',
      hub_lat: -37.3217,
      hub_lng: -59.1332,
      pickup_radius_km: 8,
      dropoff_radius_km: 50,
      match_radius_km: 8,
      geo_bias_radius_km: 20,
    };
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandilMarket]);
    const candidates = [
      { id: 'vd', name: 'Villa Dolores', province: 'Córdoba', status: 'active' },
    ];
    expect(resolveDistrictForAddress('Tandil', 'Buenos Aires', candidates, -37.3217, -59.1332)).toBeNull();
  });

  test('resolveDistrictForAddress: market fallback requires province (no cross-province name-only)', () => {
    const tandilMarket: ServiceMarketGeo = {
      id: 'm-tandil',
      slug: 'tandil',
      name: 'Tandil',
      province: 'Buenos Aires',
      status: 'active',
      hub_lat: -37.3217,
      hub_lng: -59.1332,
      pickup_radius_km: 8,
      dropoff_radius_km: 50,
      match_radius_km: 8,
      geo_bias_radius_km: 20,
    };
    setActiveServiceMarkets([LEGACY_VD_MARKET, tandilMarket]);

    // Same name, wrong province — must not resolve via market fallback.
    const wrongProvinceOnly = [
      { id: 'td-cba', name: 'Tandil', province: 'Córdoba', status: 'active' },
    ];
    expect(
      resolveDistrictForAddress(null, null, wrongProvinceOnly, -37.32515, -59.13572),
    ).toBeNull();

    expect(
      matchDistrict('Tandil', 'Buenos Aires', wrongProvinceOnly, { requireProvince: true }),
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
        photo_url: 'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
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

  test('PUT /drivers/me with San Pedro address → operational via VD market fence', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492619000011', full_name: 'SP Driver', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Pedro',
        last_name: 'San',
        phone: '+5492619000011',
        address_line: 'Belgrano 50, San Pedro, Córdoba',
        photo_url:
          'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.municipality_status).toBe('operational');
    // Coords→market fence: SP is inside VD pickup radius → canonical VD district.
    expect(data.intended_district_id).toBe(villaDoloresId);
    expect(data.address_resolved_city).toBe('Villa Dolores');

    const statusRes = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.municipality_status).toBe('operational');
    expect(statusRes.data.intended_district_id).toBe(villaDoloresId);
    expect(statusRes.data.show_municipality_waitlist_banner).toBe(false);
    expect(statusRes.data.intended_district_name).toBe('Villa Dolores');
  });

  test('PUT /drivers/me with Villa Sarmiento address → operational via VD market fence', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492619000012', full_name: 'VS Driver', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Sara',
        last_name: 'Miento',
        phone: '+5492619000012',
        address_line: 'San Martín 10, Villa Sarmiento, Córdoba',
        photo_url:
          'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
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
      .values({ phone: '+549****0002', full_name: 'Wait Driver', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Ana',
        last_name: 'Lopez',
        phone: '+549****0002',
        address_line: 'Av Colón 500, Córdoba capital',
        photo_url: 'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
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

  test('PUT /drivers/me: Villa Dolores text + pin ~13km outside pickup → waitlisted', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+549****0013', full_name: 'Spoof Driver', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    // ~13 km east of VD hub — reverse geocode mock still labels Villa Dolores
    const hubLat = -31.9449464;
    const hubLng = -65.1905677;
    const latRad = (hubLat * Math.PI) / 180;
    const degPerKm = 1 / (111.32 * Math.cos(latRad));
    const farLng = hubLng + 13 * degPerKm;

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Falso',
        last_name: 'Dolores',
        phone: '+549****0013',
        address_line: 'Calle Inventada 1, Villa Dolores, Córdoba',
        address_lat: hubLat,
        address_lng: farLng,
        photo_url:
          'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.municipality_status).toBe('waitlisted');
    expect(data.intended_district_id).toBeNull();

    const statusRes = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.municipality_status).toBe('waitlisted');
    expect(statusRes.data.show_municipality_waitlist_banner).toBe(true);
  });

  test('PUT /drivers/me: CABA pin + Villa Dolores free-text → waitlisted', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone: '+549****0014', full_name: 'Caba Spoof', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Caba',
        last_name: 'Spoof',
        phone: '+549****0014',
        address_line: 'Obelisco, Villa Dolores, Córdoba',
        address_lat: -34.6037,
        address_lng: -58.3816,
        photo_url:
          'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.municipality_status).toBe('waitlisted');
    expect(data.intended_district_id).toBeNull();
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
});
