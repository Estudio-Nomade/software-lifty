process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.SUPABASE_URL = undefined;
process.env.SUPABASE_PUBLISHABLE_KEY = undefined;
process.env.SUPABASE_SECRET_KEY = undefined;
process.env.REDIS_URL = undefined;

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import {
  districts,
  driverCommissionReceipts,
  driverDocuments,
  driverLocations,
  drivers,
  platformConfig,
  users,
  vehicles,
} from '../../shared/db/schema';
import { setConfig } from '../../shared/lib/commission';
import { DOC_TYPES } from '../../shared/lib/documents';
import { getRedis } from '../../shared/lib/redis';
import {
  buildCommissionReceiptPath,
  buildDriverAvatarPath,
  buildDriverDocumentPath,
  contentTypeForFile,
  extensionForMime,
  extractStoragePath,
  sanitizeDriverFolderName,
  type StorageProvider,
} from '../../shared/lib/storage';
import { createTestToken } from '../../shared/testing/utils';
import { isMissingOnboardingVehicleSchemaError, setStorageForTesting } from './service';

interface TestStorage extends StorageProvider {
  uploaded: Map<string, string>;
  deleted: string[];
  lastUploadOptions: Array<{ path: string; contentType?: string }>;
}

function createTestStorage() {
  const uploaded = new Map<string, string>();
  const deleted: string[] = [];
  const lastUploadOptions: Array<{ path: string; contentType?: string }> = [];
  const storage: TestStorage = {
    uploaded,
    deleted,
    lastUploadOptions,
    async uploadFile(_file: File, path: string, options?: { contentType?: string }) {
      lastUploadOptions.push({ path, contentType: options?.contentType });
      const url = `https://example.supabase.co/storage/v1/object/public/driver-documents/${path}`;
      uploaded.set(path, url);
      return url;
    },
    async deleteFile(path: string) {
      deleted.push(path);
    },
    extractStoragePath(url: string | null) {
      if (!url) return null;
      const match = url.match(/\/driver-documents\/(.+)/);
      return match ? match[1] : null;
    },
  };
  return storage;
}

let app: any;
let baseStorage: TestStorage;

async function truncateTables() {
  const db = getDb();
  await db.delete(driverCommissionReceipts);
  await db.delete(driverDocuments);
  await db.delete(vehicles);
  await db.delete(drivers);
  await db.delete(users);
  await db
    .delete(platformConfig)
    .where(eq(platformConfig.key, 'platform.lifty_payout_alias'));
  await db.delete(platformConfig).where(eq(platformConfig.key, 'platform.lifty_payout_cvu'));
  await db.delete(platformConfig).where(eq(platformConfig.key, 'platform.lifty_payout_holder'));
  await db.delete(platformConfig).where(eq(platformConfig.key, 'platform.lifty_payout_bank'));
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

async function registerAndGetToken(phone: string, _password: string): Promise<{ token: string; userId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Juan Perez', role: 'driver' })
    .returning({ id: users.id });
  return { token: await createTestToken(user.id), userId: user.id };
}

async function fullOnboarding(phone: string, password: string) {
  const { token, userId } = await registerAndGetToken(phone, password);
  const { data: step1Res } = await request(
    'PUT',
    '/api/drivers/me',
    {
      first_name: 'Juan Perez',
      address_line: 'San Martín 100, Villa Dolores, Córdoba',
      photo_url:
        'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
    },
    token,
  );
  const driverId = step1Res.id;
  const db = getDb();
  await db.update(users).set({ kyc_status: 'approved' }).where(eq(users.id, userId));
  await db.update(drivers).set({ kyc_status: 'approved' }).where(eq(drivers.id, driverId));
  await request(
    'PUT',
    '/api/drivers/me',
    {
      vehicle_brand: 'Toyota',
      vehicle_model: 'Corolla',
      vehicle_year: 2022,
      vehicle_color: 'Blanco',
      vehicle_plate: 'ABC123',
    },
    token,
  );
  return { token, driverId, userId };
}

beforeAll(() => {
  baseStorage = createTestStorage();
  setStorageForTesting(baseStorage);
  app = createApp();
});

beforeEach(async () => {
  await truncateTables();
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys('ratelimit:public-profile:ip:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch {
      /* best-effort */
    }
  }
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Driver Profile', () => {
  const phone = '+5492611111111';
  const password = 'testPass123';

  test('GET /:id/profile returns public profile', async () => {
    const { driverId } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', `/api/drivers/${driverId}/profile`);

    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
    expect(data.full_name).toBe('Juan');
    expect(data.avatar_url).toContain('avatars/test-avatar.png');
    expect(data.rating_avg).toBe(0);
    expect(data.total_trips).toBe(0);
    expect(data.kyc_verified).toBe(true);
    expect(data.vehicle.brand).toBe('Toyota');
    expect(data.vehicle.model).toBe('Corolla');
    expect(data.vehicle.year).toBe(2022);
    expect(data.vehicle.color).toBe('Blanco');
  });

  test('GET /:id/profile for non-existent driver returns 422', async () => {
    const { status, data } = await request(
      'GET',
      '/api/drivers/00000000-0000-0000-0000-000000000000/profile',
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('NOT_FOUND');
    expect(data.error.message).toBe('Driver not found');
  });

  test('GET /:id/profile without auth works (public endpoint)', async () => {
    const { driverId } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', `/api/drivers/${driverId}/profile`);

    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
  });

  test('GET /me returns full profile', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', '/api/drivers/me', undefined, token);

    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
    expect(data.user_id).toBeString();
    expect(data.phone).toBe(phone);
    expect(data.email).toBeNull();
    expect(data.full_name).toBe('Juan Perez');
    expect(data.avatar_url).toContain('avatars/test-avatar.png');
    expect(data.status).toBe('pending');
    expect(data.kyc_status).toBe('approved');
    expect(data.rating_avg).toBe(0);
    expect(data.total_trips).toBe(0);
    expect(data.completion_rate).toBe(0);
    expect(data.is_online).toBe(false);
    expect(data.vehicle.brand).toBe('Toyota');
    expect(data.vehicle.model).toBe('Corolla');
    expect(data.vehicle.year).toBe(2022);
    expect(data.vehicle.color).toBe('Blanco');
    expect(data.vehicle.plate).toBe('ABC123');
    expect(data.vehicle.vehicle_type).toBe('car');
    expect(data.created_at).toBeString();
  });

  test('GET /me without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/drivers/me');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('GET /me without driver row returns onboarding status', async () => {
    const { token } = await registerAndGetToken(phone, password);

    const { status, data } = await request('GET', '/api/drivers/me', undefined, token);

    expect(status).toBe(200);
    expect(data.step).toBe('step1');
    expect(data.message).toBe('Onboarding not started');
  });

  test('GET /:id/profile includes kyc_verified badge', async () => {
    const { driverId, userId } = await fullOnboarding(phone, password);

    const db = getDb();
    await db.update(users).set({ kyc_status: 'approved' }).where(eq(users.id, userId));
    await db.update(drivers).set({ kyc_status: 'approved' }).where(eq(drivers.id, driverId));

    const { status, data } = await request('GET', `/api/drivers/${driverId}/profile`);

    expect(status).toBe(200);
    expect(data.kyc_verified).toBe(true);
  });

  test('PUT /me/online toggles status', async () => {
    const { token, userId } = await registerAndGetToken(phone, password);
    await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Test',
        address_line: 'San Martín 100, Villa Dolores, Córdoba',
        photo_url:
          'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
      },
      token,
    );
    const db = getDb();
    const [district] = await db
      .select({ id: districts.id })
      .from(districts)
      .orderBy(districts.name)
      .limit(1);
    await db
      .update(drivers)
      .set({
        status: 'approved',
        district_id: district.id,
        identification_status: 'issued',
        identification_issued_at: new Date(),
      })
      .where(eq(drivers.user_id, userId));

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(status).toBe(200);
    expect(data.is_online).toBe(true);
    expect(data.message).toContain('online');

    const { status: s2, data: d2 } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: false },
      token,
    );
    expect(s2).toBe(200);
    expect(d2.is_online).toBe(false);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    const [driver] = await db
      .select({ is_online: drivers.is_online })
      .from(drivers)
      .where(eq(drivers.user_id, user!.id))
      .limit(1);
    expect(driver.is_online).toBe(false);
  });

  test('PUT /me/online with platform_debt over cap returns 409 COMMISSION_DEBT_CAP', async () => {
    const { token, userId } = await registerAndGetToken(phone, password);
    await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Test',
        address_line: 'San Martín 100, Villa Dolores, Córdoba',
        photo_url:
          'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
      },
      token,
    );
    const db = getDb();
    const [district] = await db
      .select({ id: districts.id })
      .from(districts)
      .orderBy(districts.name)
      .limit(1);
    await db
      .update(drivers)
      .set({
        status: 'approved',
        district_id: district.id,
        identification_status: 'issued',
        identification_issued_at: new Date(),
        platform_debt: 10001,
      })
      .where(eq(drivers.user_id, userId));

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );

    expect(status).toBe(409);
    expect(data.error.code).toBe('COMMISSION_DEBT_CAP');
    expect(data.error.message).toContain('10000');
    expect(data.error.message).toContain('10001');
  });

  test('PUT /me/online with platform_debt under cap succeeds', async () => {
    const { token, userId } = await registerAndGetToken(phone, password);
    await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Test',
        address_line: 'San Martín 100, Villa Dolores, Córdoba',
        photo_url:
          'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
      },
      token,
    );
    const db = getDb();
    const [district] = await db
      .select({ id: districts.id })
      .from(districts)
      .orderBy(districts.name)
      .limit(1);
    await db
      .update(drivers)
      .set({
        status: 'approved',
        district_id: district.id,
        identification_status: 'issued',
        identification_issued_at: new Date(),
        platform_debt: 9999,
      })
      .where(eq(drivers.user_id, userId));

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_online).toBe(true);
  });

  test('PUT /me/heartbeat force-offlines when debt over cap while online', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const db = getDb();
    const [district] = await db
      .select({ id: districts.id })
      .from(districts)
      .orderBy(districts.name)
      .limit(1);
    await db
      .update(drivers)
      .set({
        status: 'approved',
        is_online: true,
        district_id: district.id,
        identification_status: 'issued',
        identification_issued_at: new Date(),
        platform_debt: 10001,
      })
      .where(eq(drivers.id, driverId));

    const { status, data } = await request('PUT', '/api/drivers/me/heartbeat', {}, token);

    expect(status).toBe(409);
    expect(data.error.code).toBe('COMMISSION_DEBT_CAP');

    const [driver] = await db
      .select({ is_online: drivers.is_online })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(driver.is_online).toBe(false);
  });

  test('PUT /me/online without auth returns 401', async () => {
    const { status, data } = await request('PUT', '/api/drivers/me/online', { is_online: true });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('PUT /me/online without driver row returns error', async () => {
    const { token } = await registerAndGetToken(phone, password);
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(status).toBe(404);
    expect(data.error.message).toContain('Onboarding');
  });

  test('PUT /me/heartbeat updates last_heartbeat and driver_locations.updated_at', async () => {
    const { token, driverId, userId } = await fullOnboarding(phone, password);
    const db = getDb();

    await db
      .update(drivers)
      .set({ status: 'approved', is_online: true })
      .where(eq(drivers.id, driverId));

    const beforeDriver = await db
      .select({ last_heartbeat: drivers.last_heartbeat })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(beforeDriver[0]?.last_heartbeat).toBeNull();

    const { status } = await request('PUT', '/api/drivers/me/heartbeat', {}, token);

    expect(status).toBe(200);

    const [afterDriver] = await db
      .select({ last_heartbeat: drivers.last_heartbeat })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(afterDriver.last_heartbeat).not.toBeNull();
    expect(afterDriver.last_heartbeat!.getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  test('PUT /me/heartbeat without auth returns 401', async () => {
    const { status, data } = await request('PUT', '/api/drivers/me/heartbeat', {});
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('PUT /me/heartbeat without driver row returns error', async () => {
    const { token } = await registerAndGetToken(phone, password);
    const { status, data } = await request('PUT', '/api/drivers/me/heartbeat', {}, token);
    expect(status).toBe(404);
    expect(data.error.message).toContain('Onboarding');
  });

  test('PUT /me/heartbeat with lat/lng stores real coordinates in driver_locations', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const db = getDb();

    await db
      .update(drivers)
      .set({ status: 'approved', is_online: true })
      .where(eq(drivers.id, driverId));

    const { status } = await request('PUT', '/api/drivers/me/heartbeat', {
      lat: -34.6037,
      lng: -58.3816,
      heading: 180,
    }, token);

    expect(status).toBe(200);

    const [loc] = await db
      .select({ lat: driverLocations.lat, lng: driverLocations.lng, heading: driverLocations.heading })
      .from(driverLocations)
      .where(eq(driverLocations.driver_id, driverId))
      .limit(1);

    expect(loc).toBeDefined();
    expect(loc.lat).toBeCloseTo(-34.6037, 1);
    expect(loc.lng).toBeCloseTo(-58.3816, 1);
    expect(loc.heading).toBe(180);
  });

  test('PUT /me/heartbeat without lat/lng does not create location row', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const db = getDb();

    await db
      .update(drivers)
      .set({ status: 'approved', is_online: true })
      .where(eq(drivers.id, driverId));

    const { status } = await request('PUT', '/api/drivers/me/heartbeat', {}, token);

    expect(status).toBe(200);

    const [loc] = await db
      .select({ driver_id: driverLocations.driver_id })
      .from(driverLocations)
      .where(eq(driverLocations.driver_id, driverId))
      .limit(1);

    expect(loc).toBeUndefined();
  });

  test('GET /me includes vehicle data', async () => {
    const { token } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', '/api/drivers/me', undefined, token);

    expect(status).toBe(200);
    expect(data.vehicle.brand).toBe('Toyota');
    expect(data.vehicle.model).toBe('Corolla');
    expect(data.vehicle.year).toBe(2022);
    expect(data.vehicle.color).toBe('Blanco');
    expect(data.vehicle.plate).toBe('ABC123');
    expect(data.vehicle.vehicle_type).toBe('car');
  });

  test('GET /:id/profile enforces strict public rate limit', async () => {
    const { driverId } = await fullOnboarding(phone, password);
    const ip = '203.0.113.7';

    const call = async () => {
      const req = new Request(`http://localhost/api/drivers/${driverId}/profile`, {
        method: 'GET',
        headers: { 'x-forwarded-for': ip },
      });
      return app.handle(req);
    };

    for (let i = 0; i < 11; i++) {
      const res = await call();
      if (i < 10) {
        expect(res.status).toBe(200);
      } else {
        expect(res.status).toBe(429);
      }
    }
  });

  test('/me routes are NOT throttled by the public profile rate limiter', async () => {
    const { driverId, token } = await fullOnboarding(phone, password);
    const ip = '203.0.113.99';

    const publicCall = async () => {
      const req = new Request(`http://localhost/api/drivers/${driverId}/profile`, {
        method: 'GET',
        headers: { 'x-forwarded-for': ip },
      });
      return app.handle(req);
    };

    const authCall = async () => {
      const req = new Request('http://localhost/api/drivers/me', {
        method: 'GET',
        headers: { 'x-forwarded-for': ip, Authorization: `Bearer ${token}` },
      });
      return app.handle(req);
    };

    for (let i = 0; i < 10; i++) {
      const res = await publicCall();
      expect(res.status).toBe(200);
    }

    const publicRes = await publicCall();
    expect(publicRes.status).toBe(429);

    const authRes = await authCall();
    expect(authRes.status).toBe(200);
  });
});

async function reupload(token: string, docType: string) {
  const formData = new FormData();
  formData.append('file', new Blob(['content'], { type: 'image/png' }), `${docType}.png`);
  formData.append('doc_type', docType);
  const req = new Request('http://localhost/api/drivers/me/documents/reupload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const res = await app.handle(req);
  return { status: res.status, data: await res.json() };
}

describe('Document re-upload', () => {
  const phone = '+5492617777777';
  const password = 'testPass123';

  test('re-uploading a sensitive doc pauses online and flags review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const db = getDb();
    await db.update(drivers).set({ is_online: true, status: 'approved' }).where(eq(drivers.id, driverId));

    const { status, data } = await reupload(token, 'license_front');
    expect(status).toBe(200);
    expect(data.status).toBe('pending_review');
    expect(data.requires_review).toBe(true);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(driver!.documents_pending_review).toBe(true);
    expect(driver!.is_online).toBe(false);
    expect(driver!.status).toBe('review');
    expect(driver!.admin_review_status).toBe('pending');
  });

  test('cannot go online while documents pending review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await reupload(token, 'license_front');

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(status).toBe(409);
    expect(data.error.code).toBe('DOCUMENTS_UNDER_REVIEW');
  });

  test('re-upload supersedes previous doc of same type', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const db = getDb();
    await db
      .insert(driverDocuments)
      .values({ driver_id: driverId, doc_type: 'license_front', file_url: 'https://x.com/old.png', status: 'approved' });

    await reupload(token, 'license_front');

    const all = await db.select().from(driverDocuments).where(eq(driverDocuments.driver_id, driverId));
    const superseded = all.filter((d) => d.status === 'superseded');
    const pending = all.filter((d) => d.status === 'pending_review');
    expect(superseded.length).toBe(1);
    expect(pending.length).toBe(1);

    const { data: listed } = await request('GET', '/api/drivers/me/documents', undefined, token);
    expect(listed.every((d: { status: string }) => d.status !== 'superseded')).toBe(true);
  });

  test('admin approval clears pending flag and approves docs', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await reupload(token, 'license_front');

    const db = getDb();
    const [admin] = await db
      .insert(users)
      .values({ phone: '+5492610000001', role: 'admin' })
      .returning({ id: users.id });
    const adminToken = await createTestToken(admin.id);

    const { status } = await request(
      'POST',
      `/api/admin/drivers/${driverId}/review`,
      { action: 'approve' },
      adminToken,
    );
    expect(status).toBe(200);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(driver!.documents_pending_review).toBe(false);

    const docs = await db.select().from(driverDocuments).where(eq(driverDocuments.driver_id, driverId));
    expect(docs.some((d) => d.status === 'approved' && d.verified_at !== null)).toBe(true);
  });

  test('background_check re-upload also requires review', async () => {
    const { token } = await fullOnboarding(phone, password);
    const { status, data } = await reupload(token, 'background_check_front');
    expect(status).toBe(200);
    expect(data.requires_review).toBe(true);
  });
});

describe('Vehicle step (no duplicate form)', () => {
  const phone = '+5492617777001';
  const password = 'testPass123';

  test('status is vehicle when KYC approved and no vehicle row', async () => {
    const { token, userId } = await registerAndGetToken(phone, password);
    const { data: step1 } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Ana',
        last_name: 'Gomez',
        address_line: 'San Martín 100, Villa Dolores, Córdoba',
        photo_url:
          'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
      },
      token,
    );
    await getDb().update(users).set({ kyc_status: 'approved' }).where(eq(users.id, userId));
    await getDb().update(drivers).set({ kyc_status: 'approved' }).where(eq(drivers.id, step1.id));

    const { data } = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(data.step).toBe('vehicle');
  });

  test('after vehicle PUT, status is documents (not vehicle again)', async () => {
    const { token } = await fullOnboarding(phone, password);
    const { data } = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(data.step).toBe('documents');
  });

  test('second vehicle PUT is idempotent and stays on documents', async () => {
    const { token } = await fullOnboarding(phone, password);
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Toyota',
        vehicle_model: 'Corolla',
        vehicle_year: 2022,
        vehicle_color: 'Blanco',
        vehicle_plate: 'ABC123',
        vehicle_type: 'car',
      },
      token,
    );
    expect(status).toBe(200);
    expect(data.step).toBe('documents');

    const me = await request('GET', '/api/drivers/me', undefined, token);
    expect(me.data.vehicle.plate).toBe('ABC123');
    expect(me.data.vehicle.brand).toBe('Toyota');
  });

  test('vehicle PUT before KYC returns KYC_REQUIRED', async () => {
    const { token } = await registerAndGetToken('+5492617777002', password);
    await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Ana',
        address_line: 'San Martín 100, Villa Dolores, Córdoba',
        photo_url:
          'https://example.supabase.co/storage/v1/object/public/driver-documents/avatars/test-avatar.png',
      },
      token,
    );
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Toyota',
        vehicle_model: 'Corolla',
        vehicle_year: 2022,
        vehicle_color: 'Blanco',
        vehicle_plate: 'ABC123',
      },
      token,
    );
    expect(status).toBe(400);
    expect(data.error?.code).toBe('KYC_REQUIRED');
  });

  test('vehicle PUT with year older than policy returns VEHICLE_YEAR_INVALID', async () => {
    const { token } = await fullOnboarding('+5492617777003', password);
    const oldYear = Math.max(2011, new Date().getFullYear() - 15) - 1;
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Toyota',
        vehicle_model: 'Corolla',
        vehicle_year: oldYear,
        vehicle_color: 'Blanco',
        vehicle_plate: 'XYZ999',
        vehicle_type: 'car',
      },
      token,
    );
    expect(status).toBe(400);
    expect(data.error?.code).toBe('VEHICLE_YEAR_INVALID');
  });

  test('moto vehicle PUT with engine_cc 150 stores and GET me returns it', async () => {
    const { token } = await fullOnboarding('+5492617777004', password);
    const { status } = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Honda',
        vehicle_model: 'CG',
        vehicle_year: 2022,
        vehicle_color: 'Rojo',
        vehicle_plate: 'MOT150',
        vehicle_type: 'motorcycle',
        vehicle_engine_cc: 150,
        license_category: 'A3',
      },
      token,
    );
    expect(status).toBe(200);

    const me = await request('GET', '/api/drivers/me', undefined, token);
    expect(me.data.vehicle.vehicle_type).toBe('motorcycle');
    expect(me.data.vehicle.engine_cc).toBe(150);
  });

  test('moto vehicle PUT with engine_cc 149 returns VEHICLE_ENGINE_CC_INVALID', async () => {
    const { token } = await fullOnboarding('+5492617777005', password);
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Honda',
        vehicle_model: 'CG',
        vehicle_year: 2022,
        vehicle_color: 'Rojo',
        vehicle_plate: 'MOT149',
        vehicle_type: 'motorcycle',
        vehicle_engine_cc: 149,
        license_category: 'A3',
      },
      token,
    );
    expect(status).toBe(400);
    expect(data.error?.code).toBe('VEHICLE_ENGINE_CC_INVALID');
  });

  test('moto vehicle PUT without engine_cc returns VEHICLE_ENGINE_CC_INVALID', async () => {
    const { token } = await fullOnboarding('+549****7006', password);
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Honda',
        vehicle_model: 'CG',
        vehicle_year: 2022,
        vehicle_color: 'Rojo',
        vehicle_plate: 'MOT000',
        vehicle_type: 'motorcycle',
        license_category: 'A3',
      },
      token,
    );
    expect(status).toBe(400);
    expect(data.error?.code).toBe('VEHICLE_ENGINE_CC_INVALID');
  });

  test('moto license A1 returns LICENSE_CATEGORY_INVALID; A4 is accepted', async () => {
    const { token } = await fullOnboarding('+549****7012', password);
    const bad = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Honda',
        vehicle_model: 'CG',
        vehicle_year: 2022,
        vehicle_color: 'Rojo',
        vehicle_plate: 'MOTA01',
        vehicle_type: 'motorcycle',
        vehicle_engine_cc: 150,
        license_category: 'A1',
      },
      token,
    );
    expect(bad.status).toBe(400);
    expect(bad.data.error?.code).toBe('LICENSE_CATEGORY_INVALID');

    const ok = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Honda',
        vehicle_model: 'CG',
        vehicle_year: 2022,
        vehicle_color: 'Rojo',
        vehicle_plate: 'MOTA04',
        vehicle_type: 'motorcycle',
        vehicle_engine_cc: 150,
        license_category: 'A4',
      },
      token,
    );
    expect(ok.status).toBe(200);

    const me = await request('GET', '/api/drivers/me', undefined, token);
    expect(me.data.license_category).toBe('A4');
    expect(me.data.license_professional_status).toBe('not_required');
  });

  test('car vehicle PUT strips engine_cc to null', async () => {
    const { token } = await fullOnboarding('+549****7007', password);
    const { status } = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Toyota',
        vehicle_model: 'Corolla',
        vehicle_year: 2022,
        vehicle_color: 'Blanco',
        vehicle_plate: 'CAR250',
        vehicle_type: 'car',
        vehicle_engine_cc: 250,
      },
      token,
    );
    expect(status).toBe(200);

    const me = await request('GET', '/api/drivers/me', undefined, token);
    expect(me.data.vehicle.vehicle_type).toBe('car');
    expect(me.data.vehicle.engine_cc).toBeNull();
  });

  test('vehicle PUT without vehicle_type keeps existing motorcycle type and cc', async () => {
    const { token } = await fullOnboarding('+549****7008', password);
    await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Honda',
        vehicle_model: 'CG',
        vehicle_year: 2022,
        vehicle_color: 'Rojo',
        vehicle_plate: 'A123BCD',
        vehicle_type: 'motorcycle',
        vehicle_engine_cc: 150,
        license_category: 'A3',
      },
      token,
    );

    const { status } = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Yamaha',
        vehicle_model: 'YBR',
        vehicle_year: 2023,
        vehicle_color: 'Negro',
        vehicle_plate: 'A123BCD',
        // no vehicle_type, no vehicle_engine_cc
      },
      token,
    );
    expect(status).toBe(200);

    const me = await request('GET', '/api/drivers/me', undefined, token);
    expect(me.data.vehicle.vehicle_type).toBe('motorcycle');
    expect(me.data.vehicle.engine_cc).toBe(150);
    expect(me.data.vehicle.brand).toBe('Yamaha');
  });

  test('moto chip PUT stores insurance coverage and GET me returns it', async () => {
    const { token } = await fullOnboarding('+5492617777009', password);
    await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Honda',
        vehicle_model: 'CG',
        vehicle_year: 2022,
        vehicle_color: 'Rojo',
        vehicle_plate: 'MOTCOV',
        vehicle_type: 'motorcycle',
        vehicle_engine_cc: 150,
        license_category: 'A3',
      },
      token,
    );

    const { status } = await request(
      'PUT',
      '/api/drivers/me',
      { vehicle_insurance_coverage_type: 'third_party' },
      token,
    );
    expect(status).toBe(200);

    const me = await request('GET', '/api/drivers/me', undefined, token);
    expect(me.data.vehicle.insurance_coverage_type).toBe('third_party');
  });

  test('moto chip PUT invalid coverage returns VEHICLE_INSURANCE_COVERAGE_INVALID', async () => {
    const { token } = await fullOnboarding('+5492617777010', password);
    await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Honda',
        vehicle_model: 'CG',
        vehicle_year: 2022,
        vehicle_color: 'Rojo',
        vehicle_plate: 'MOTBAD',
        vehicle_type: 'motorcycle',
        vehicle_engine_cc: 150,
        license_category: 'A3',
      },
      token,
    );

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      { vehicle_insurance_coverage_type: 'todo_riesgo' },
      token,
    );
    expect(status).toBe(400);
    expect(data.error?.code).toBe('VEHICLE_INSURANCE_COVERAGE_INVALID');
  });

  test('car vehicle PUT strips insurance_coverage_type to null', async () => {
    const { token } = await fullOnboarding('+5492617777011', password);
    const { status } = await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Toyota',
        vehicle_model: 'Corolla',
        vehicle_year: 2022,
        vehicle_color: 'Blanco',
        vehicle_plate: 'CARCOV',
        vehicle_type: 'car',
        vehicle_insurance_coverage_type: 'comprehensive',
      },
      token,
    );
    expect(status).toBe(200);

    const me = await request('GET', '/api/drivers/me', undefined, token);
    expect(me.data.vehicle.vehicle_type).toBe('car');
    expect(me.data.vehicle.insurance_coverage_type).toBeNull();
  });
});

describe('Document step completeness', () => {
  const phone = '+5492619999999';
  const password = 'testPass123';

  // Canonical required set: no background_check_back, no insurance_back;
  // platform_rc_insurance_front is required (distinct from insurance_front).
  test('DOC_TYPES matches mobile-aligned canonical set', () => {
    expect([...DOC_TYPES].sort()).toEqual(
      [
        'background_check_front',
        'insurance_front',
        'license_back',
        'license_front',
        'platform_rc_insurance_front',
        'registration_back',
        'registration_front',
        'rndg_front',
      ].sort(),
    );
    expect(DOC_TYPES).not.toContain('background_check_back');
    expect(DOC_TYPES).not.toContain('insurance_back');
    expect(DOC_TYPES).toContain('platform_rc_insurance_front');
  });

  test('all required docs without insurance_back moves driver to review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await getDb().insert(driverDocuments).values(
      DOC_TYPES.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('review');
  });

  test('moto with all docs and comprehensive coverage enters review', async () => {
    const { token, driverId } = await fullOnboarding('+5492619999901', password);
    await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Honda',
        vehicle_model: 'CG',
        vehicle_year: 2022,
        vehicle_color: 'Rojo',
        vehicle_plate: 'MOTREV',
        vehicle_type: 'motorcycle',
        vehicle_engine_cc: 150,
        vehicle_insurance_coverage_type: 'comprehensive',
        license_category: 'A3',
      },
      token,
    );
    await getDb().insert(driverDocuments).values(
      DOC_TYPES.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('review');
  });

  test('moto with all docs but no coverage stays in documents', async () => {
    const { token, driverId } = await fullOnboarding('+5492619999902', password);
    await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Honda',
        vehicle_model: 'CG',
        vehicle_year: 2022,
        vehicle_color: 'Rojo',
        vehicle_plate: 'MOTDOC',
        vehicle_type: 'motorcycle',
        vehicle_engine_cc: 150,
        license_category: 'A3',
      },
      token,
    );
    await getDb().insert(driverDocuments).values(
      DOC_TYPES.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('documents');
  });

  test('moto with all docs and third_party coverage enters review', async () => {
    const { token, driverId } = await fullOnboarding('+5492619999903', password);
    await request(
      'PUT',
      '/api/drivers/me',
      {
        vehicle_brand: 'Yamaha',
        vehicle_model: 'YBR',
        vehicle_year: 2023,
        vehicle_color: 'Negro',
        vehicle_plate: 'MOT3RD',
        vehicle_type: 'motorcycle',
        vehicle_engine_cc: 150,
        vehicle_insurance_coverage_type: 'third_party',
        license_category: 'A3',
      },
      token,
    );
    await getDb().insert(driverDocuments).values(
      DOC_TYPES.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('review');
  });

  test('status stays in documents step until all required doc types uploaded', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    // All required except rndg_front → still documents.
    const incomplete = DOC_TYPES.filter((t) => t !== 'rndg_front');
    await getDb().insert(driverDocuments).values(
      incomplete.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('documents');
  });

  test('duplicate doc types do not complete the documents step', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await getDb().insert(driverDocuments).values(
      Array.from({ length: DOC_TYPES.length }, () => ({
        driver_id: driverId,
        doc_type: 'license_front',
        file_url: 'https://x.com/f.png',
      })),
    );

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('documents');
  });

  test('all distinct required doc types move driver to review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await getDb().insert(driverDocuments).values(
      DOC_TYPES.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('review');
  });

  // Docs complete via direct insert (legacy/seed path) without upload hook →
  // getMyStatus must reconcile drivers.status to 'review' so admin pending sees them.
  test('GET /me/status reconciles status=review when docs complete but status was not review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await getDb().insert(driverDocuments).values(
      DOC_TYPES.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );

    const [before] = await getDb()
      .select({ status: drivers.status, admin_review_status: drivers.admin_review_status })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(before!.status).not.toBe('review');

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('review');
    expect(data.status).toBe('under_review');

    const [after] = await getDb()
      .select({ status: drivers.status, admin_review_status: drivers.admin_review_status })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(after!.status).toBe('review');
    expect(after!.admin_review_status).toBe('pending');
  });

  test('GET /me/status reconcile is idempotent when already in review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await getDb().insert(driverDocuments).values(
      DOC_TYPES.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );
    await getDb()
      .update(drivers)
      .set({ status: 'review', admin_review_status: 'pending' })
      .where(eq(drivers.id, driverId));

    const res1 = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect((await res1.json()).step).toBe('review');

    const res2 = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect((await res2.json()).step).toBe('review');

    const [row] = await getDb()
      .select({ status: drivers.status })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(row!.status).toBe('review');
  });

  test('last required upload via addDocument sets status=review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const allButLast = DOC_TYPES.slice(0, -1);
    const last = DOC_TYPES[DOC_TYPES.length - 1]!;

    await getDb().insert(driverDocuments).values(
      allButLast.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );

    const before = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(before.data.step).toBe('documents');

    const { status, data } = await request(
      'POST',
      '/api/drivers/me/documents',
      { doc_type: last, file_url: 'https://x.com/last.png' },
      token,
    );
    expect(status).toBe(200);
    expect(data.step).toBe('review');
    expect(data.status).toBe('under_review');

    const [driver] = await getDb()
      .select({ status: drivers.status, admin_review_status: drivers.admin_review_status })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(driver!.status).toBe('review');
    expect(driver!.admin_review_status).toBe('pending');
  });

  test('rejected + incomplete docs → status rejected step documents with missing types', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const incomplete = DOC_TYPES.filter((t) => t !== 'platform_rc_insurance_front');
    await getDb().insert(driverDocuments).values(
      incomplete.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
        status: 'pending_review',
      })),
    );
    await getDb()
      .update(drivers)
      .set({
        status: 'rejected',
        admin_review_status: 'rejected',
        admin_review_notes: 'Falta el RC',
      })
      .where(eq(drivers.id, driverId));

    const res = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('rejected');
    expect(res.data.step).toBe('documents');
    expect(res.data.admin_review_notes).toBe('Falta el RC');
    expect(res.data.missing_doc_types).toContain('platform_rc_insurance_front');
  });

  test('rejected + upload missing doc re-enters review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const incomplete = DOC_TYPES.filter((t) => t !== 'platform_rc_insurance_front');
    await getDb().insert(driverDocuments).values(
      incomplete.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
        status: 'pending_review',
      })),
    );
    await getDb()
      .update(drivers)
      .set({
        status: 'rejected',
        admin_review_status: 'rejected',
        admin_review_notes: 'Falta el RC',
      })
      .where(eq(drivers.id, driverId));

    const upload = await request(
      'POST',
      '/api/drivers/me/documents',
      { doc_type: 'platform_rc_insurance_front', file_url: 'https://x.com/rc.pdf' },
      token,
    );
    expect(upload.status).toBe(200);
    expect(upload.data.step).toBe('review');
    expect(upload.data.status).toBe('under_review');

    const [driver] = await getDb()
      .select({
        status: drivers.status,
        admin_review_status: drivers.admin_review_status,
        admin_review_notes: drivers.admin_review_notes,
        documents_pending_review: drivers.documents_pending_review,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(driver!.status).toBe('review');
    expect(driver!.admin_review_status).toBe('pending');
    expect(driver!.admin_review_notes).toBeNull();
    expect(driver!.documents_pending_review).toBe(true);

    const me = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(me.data.status).toBe('under_review');
    expect(me.data.step).toBe('review');
  });

  test('rejected + full docs via reupload re-enters review with pending flag', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await getDb().insert(driverDocuments).values(
      DOC_TYPES.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
        status: 'pending_review',
      })),
    );
    await getDb()
      .update(drivers)
      .set({
        status: 'rejected',
        admin_review_status: 'rejected',
        admin_reviewed_at: new Date(),
        admin_review_notes: 'Corregí licencia',
        documents_pending_review: false,
      })
      .where(eq(drivers.id, driverId));

    const { status } = await reupload(token, 'license_front');
    expect(status).toBe(200);

    const [driver] = await getDb()
      .select({
        status: drivers.status,
        admin_review_status: drivers.admin_review_status,
        documents_pending_review: drivers.documents_pending_review,
        admin_reviewed_at: drivers.admin_reviewed_at,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(driver!.status).toBe('review');
    expect(driver!.admin_review_status).toBe('pending');
    expect(driver!.documents_pending_review).toBe(true);
    expect(driver!.admin_reviewed_at).toBeNull();
  });

  test('reupload while already in review keeps review + pending flag', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await getDb().insert(driverDocuments).values(
      DOC_TYPES.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
        status: 'pending_review',
      })),
    );
    await getDb()
      .update(drivers)
      .set({
        status: 'review',
        admin_review_status: 'pending',
        admin_review_notes: 'Falta dorso nítido',
        documents_pending_review: false,
      })
      .where(eq(drivers.id, driverId));

    const { status, data } = await reupload(token, 'license_back');
    expect(status).toBe(200);
    expect(data.requires_review).toBe(true);

    const [driver] = await getDb()
      .select({
        status: drivers.status,
        admin_review_status: drivers.admin_review_status,
        documents_pending_review: drivers.documents_pending_review,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(driver!.status).toBe('review');
    expect(driver!.admin_review_status).toBe('pending');
    expect(driver!.documents_pending_review).toBe(true);
  });
});

describe('Avatar photo upload', () => {
  const phone = '+549****8888';
  const password = 'testPass123';

  async function uploadPhoto(token: string) {
    const formData = new FormData();
    formData.append('file', new Blob(['image-data'], { type: 'image/png' }), 'avatar.png');
    const req = new Request('http://localhost/api/drivers/me/photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const res = await app.handle(req);
    return { status: res.status, data: await res.json() };
  }

  test('PUT /me profile completion without avatar returns AVATAR_REQUIRED', async () => {
    const { token } = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Juan',
        last_name: 'Perez',
        address_line: 'San Martín 100, Villa Dolores, Córdoba',
      },
      token,
    );

    expect(status).toBe(400);
    expect(data.error?.code).toBe('AVATAR_REQUIRED');
  });

  test('PUT /me rejects photo_url outside driver-documents avatars', async () => {
    const { token } = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me',
      {
        first_name: 'Juan',
        photo_url: 'https://evil.example/avatar.png',
      },
      token,
    );

    expect(status).toBe(400);
    expect(data.error?.code).toBe('AVATAR_URL_INVALID');
  });

  test('PUT /me with photo_url null does not clear existing avatar', async () => {
    const { token } = await registerAndGetToken(phone, password);
    const { data: uploaded } = await uploadPhoto(token);

    // Only null photo_url — no profile-completion fields that require address.
    const { status } = await request('PUT', '/api/drivers/me', { photo_url: null }, token);
    expect(status).toBe(200);

    const { data: profile } = await request('GET', '/api/drivers/me', undefined, token);
    expect(profile.avatar_url).toBe(uploaded.file_url);
  });

  test('POST /me/photo uploads avatar and sets avatar_url', async () => {
    const { token } = await registerAndGetToken(phone, password);

    const { status, data } = await uploadPhoto(token);

    expect(status).toBe(200);
    expect(data.file_url).toBeString();
    expect(data.file_url).toContain('avatars/');

    const { data: profile } = await request('GET', '/api/drivers/me', undefined, token);
    expect(profile.avatar_url).toBe(data.file_url);
  });

  test('POST /me/photo replaces old avatar_url on re-upload', async () => {
    const { token } = await registerAndGetToken(phone, password);

    const { data: first } = await uploadPhoto(token);
    const { data: second } = await uploadPhoto(token);

    expect(second.file_url).not.toBe(first.file_url);

    const { data: profile } = await request('GET', '/api/drivers/me', undefined, token);
    expect(profile.avatar_url).toBe(second.file_url);
  });

  test('POST /me/photo without auth returns 401', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['data'], { type: 'image/png' }), 'avatar.png');
    const req = new Request('http://localhost/api/drivers/me/photo', {
      method: 'POST',
      body: formData,
    });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
  });
});

describe('extractStoragePath', () => {
  test('extracts path from public URL', () => {
    const path = extractStoragePath(
      'https://abc.supabase.co/storage/v1/object/public/driver-documents/avatars/user123-4567890',
    );
    expect(path).toBe('avatars/user123-4567890');
  });

  test('returns null for null input', () => {
    expect(extractStoragePath(null)).toBeNull();
  });

  test('returns null for unrecognized URL format', () => {
    expect(extractStoragePath('https://example.com/photo.jpg')).toBeNull();
  });

  test('extracts path from signed URL', () => {
    const path = extractStoragePath(
      'https://abc.supabase.co/storage/v1/object/sign/driver-documents/drivers/doc-123',
    );
    expect(path).toBe('drivers/doc-123');
  });
});

describe('driver storage path naming', () => {
  test('sanitizeDriverFolderName keeps readable full name and strips path junk', () => {
    expect(sanitizeDriverFolderName('  Juan Pérez  ')).toBe('Juan Pérez');
    expect(sanitizeDriverFolderName('A/B\\C?D*E')).toBe('A B C D E');
    expect(sanitizeDriverFolderName('')).toBe('sin-nombre');
    expect(sanitizeDriverFolderName(null)).toBe('sin-nombre');
    expect(sanitizeDriverFolderName('x'.repeat(80)).length).toBe(40);
  });

  test('extensionForMime and contentTypeForFile map common types', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('application/pdf')).toBe('pdf');
    expect(contentTypeForFile({ type: 'image/png', name: 'x.bin' })).toBe('image/png');
    expect(contentTypeForFile({ type: '', name: 'doc.pdf' })).toBe('application/pdf');
  });

  test('buildDriverDocumentPath uses full name + short uuid + ext', () => {
    const path = buildDriverDocumentPath({
      fullName: 'María Nóbile',
      driverId: 'fea758fb-4fb5-4b80-b77b-16376d433473',
      docType: 'license_front',
      file: { type: 'image/jpeg', name: 'photo.jpg' },
      now: 1700000000000,
    });
    expect(path).toBe('drivers/María Nóbile_fea758fb/license_front-1700000000000.jpg');
  });

  test('buildDriverAvatarPath uses full name + short id + ext', () => {
    const path = buildDriverAvatarPath({
      fullName: 'Juan Perez',
      ownerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      file: { type: 'image/png', name: 'a.png' },
      now: 100,
    });
    expect(path).toBe('avatars/Juan Perez_aaaaaaaa-100.png');
  });

  test('POST /me/documents/upload stores path with driver name folder and contentType', async () => {
    const phone = '+5492614444001';
    const { token, driverId } = await fullOnboarding(phone, 'testPass123');
    const testStorage = createTestStorage();
    setStorageForTesting(testStorage);

    const formData = new FormData();
    formData.append('file', new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), 'license.jpg');
    formData.append('doc_type', 'license_front');
    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/documents/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.file_url).toContain('drivers/Juan Perez_');
    expect(data.file_url).toContain(`${driverId.slice(0, 8)}/license_front-`);
    expect(data.file_url).toMatch(/\.jpg$/);

    const uploadedPath = [...testStorage.uploaded.keys()][0]!;
    expect(uploadedPath.startsWith(`drivers/Juan Perez_${driverId.slice(0, 8)}/`)).toBe(true);
    expect(testStorage.lastUploadOptions[0]?.contentType).toBe('image/jpeg');
  });

  test('POST /me/photo uses named avatar path', async () => {
    const { token, driverId } = await fullOnboarding('+5492614444002', 'testPass123');
    const testStorage = createTestStorage();
    setStorageForTesting(testStorage);

    const formData = new FormData();
    formData.append('file', new Blob(['image-data'], { type: 'image/png' }), 'avatar.png');
    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/photo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.file_url).toContain(`avatars/Juan Perez_${driverId.slice(0, 8)}-`);
    expect(data.file_url).toMatch(/\.png$/);
    expect(testStorage.lastUploadOptions[0]?.contentType).toBe('image/png');
  });
});

describe('reuploadDocument storage flow', () => {
  const phone = '+5492615555555';
  const password = 'testPass123';

  test('deletes previous file from storage and uploads new one', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const db = getDb();

    await db.insert(driverDocuments).values({
      driver_id: driverId,
      doc_type: 'license_front',
      file_url: 'https://example.supabase.co/storage/v1/object/public/driver-documents/drivers/old-license.png',
      status: 'approved',
    });

    const testStorage = createTestStorage();
    setStorageForTesting(testStorage);

    const { status, data } = await reupload(token, 'license_front');
    expect(status).toBe(200);
    expect(data.status).toBe('pending_review');

    expect(testStorage.deleted).toContain('drivers/old-license.png');
    expect(testStorage.uploaded.size).toBe(1);

    const docs = await db
      .select()
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driverId))
      .orderBy(driverDocuments.created_at);

    const superseded = docs.filter((d) => d.status === 'superseded');
    const pending = docs.filter((d) => d.status === 'pending_review');
    expect(superseded.length).toBe(1);
    expect(pending.length).toBe(1);
    expect(pending[0].file_url).toBe(data.file_url);
  });

  test('re-upload works when there is no previous document', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);

    const testStorage = createTestStorage();
    setStorageForTesting(testStorage);

    const { status, data } = await reupload(token, 'registration_front');
    expect(status).toBe(200);
    expect(data.status).toBe('pending_review');

    expect(testStorage.deleted.length).toBe(0);
    expect(testStorage.uploaded.size).toBe(1);

    const db = getDb();
    const docs = await db
      .select()
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driverId));

    expect(docs.length).toBe(1);
    expect(docs[0].doc_type).toBe('registration_front');
    expect(docs[0].status).toBe('pending_review');
  });

  test('handles previous doc with non-extractable storage URL gracefully', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const db = getDb();

    await db.insert(driverDocuments).values({
      driver_id: driverId,
      doc_type: 'license_front',
      file_url: 'https://legacy-cdn.example.com/files/doc.png',
      status: 'approved',
    });

    const testStorage = createTestStorage();
    setStorageForTesting(testStorage);

    const { status, data } = await reupload(token, 'license_front');
    expect(status).toBe(200);
    expect(data.status).toBe('pending_review');

    expect(testStorage.deleted.length).toBe(0);
    expect(testStorage.uploaded.size).toBe(1);

    const docs = await db
      .select()
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driverId));

    const superseded = docs.filter((d) => d.status === 'superseded');
    expect(superseded.length).toBe(1);
    expect(superseded[0].file_url).toBe('https://legacy-cdn.example.com/files/doc.png');
  });

  test('upload failure preserves existing document state', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const db = getDb();

    await db.insert(driverDocuments).values({
      driver_id: driverId,
      doc_type: 'insurance_front',
      file_url: 'https://example.supabase.co/storage/v1/object/public/driver-documents/drivers/insurance.png',
      status: 'approved',
    });

    const failStorage = createTestStorage();
    failStorage.uploadFile = async () => {
      throw new Error('Storage unreachable');
    };
    setStorageForTesting(failStorage);

    const { status } = await reupload(token, 'insurance_front');
    expect(status).toBe(500);

    const docs = await db
      .select()
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driverId));

    expect(docs.length).toBe(1);
    expect(docs[0].status).toBe('approved');
    expect(docs[0].file_url).toContain('insurance.png');
  });

  test('rejects invalid doc_type with 400', async () => {
    const { token } = await fullOnboarding(phone, password);
    const { status, data } = await reupload(token, 'passport_photo');
    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
  });

  test('returns 404 when driver has no profile', async () => {
    const { token } = await registerAndGetToken(phone, password);
    const { status, data } = await reupload(token, 'license_front');
    expect(status).toBe(404);
    expect(data.error.message).toContain('onboarding');
  });

  test('returns 401 without authentication', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['content'], { type: 'image/png' }), 'doc.png');
    formData.append('doc_type', 'license_front');
    const req = new Request('http://localhost/api/drivers/me/documents/reupload', {
      method: 'POST',
      body: formData,
    });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
  });
});

describe('commission receipt upload', () => {
  const phone = '+5492618888001';
  const password = 'testPass123';

  async function seedPayoutConfig() {
    const db = getDb();
    await setConfig(db, 'platform.lifty_payout_alias', 'lifty.cobros');
    await setConfig(db, 'platform.lifty_payout_cvu', '0000003100010000000001');
    await setConfig(db, 'platform.lifty_payout_holder', 'Lifty Viajes SA');
    await setConfig(db, 'platform.lifty_payout_bank', 'Banco Galicia');
  }

  async function approveForOnline(driverId: string, debt = 5000) {
    const db = getDb();
    const [district] = await db
      .select({ id: districts.id })
      .from(districts)
      .orderBy(districts.name)
      .limit(1);
    await db
      .update(drivers)
      .set({
        status: 'approved',
        district_id: district.id,
        identification_status: 'issued',
        identification_issued_at: new Date(),
        platform_debt: debt,
        commission_fraud_block: false,
        is_online: false,
      })
      .where(eq(drivers.id, driverId));
  }

  async function postReceipt(token: string, amount: string | number, fileName = 'receipt.jpg') {
    const formData = new FormData();
    formData.append('file', new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), fileName);
    formData.append('amount_ars', String(amount));
    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/commission-receipts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }),
    );
    const data = await res.json();
    return { status: res.status, data };
  }

  test('buildCommissionReceiptPath uses commission-receipts prefix', () => {
    const path = buildCommissionReceiptPath({
      fullName: 'Juan Perez',
      driverId: 'abcdef12-3456-7890-abcd-ef1234567890',
      file: { type: 'image/jpeg', name: 'x.jpg' },
      now: 1700000000000,
    });
    expect(path).toMatch(/^commission-receipts\/Juan Perez_abcdef12\/1700000000000\.jpg$/);
  });

  test('GET /me/payout-info returns config + debt', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await seedPayoutConfig();
    await approveForOnline(driverId, 4200);

    const { status, data } = await request('GET', '/api/drivers/me/payout-info', undefined, token);
    expect(status).toBe(200);
    expect(data.alias).toBe('lifty.cobros');
    expect(data.cvu).toBe('0000003100010000000001');
    expect(data.holder).toBe('Lifty Viajes SA');
    expect(data.bank).toBe('Banco Galicia');
    expect(data.platform_debt).toBe(4200);
    expect(typeof data.debt_cap_ars).toBe('number');
  });

  test('happy path: amount >= debt clears balance and creates pending receipt', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await seedPayoutConfig();
    await approveForOnline(driverId, 5000);
    const testStorage = createTestStorage();
    setStorageForTesting(testStorage);

    const { status, data } = await postReceipt(token, 5000);
    expect(status).toBe(200);
    expect(data.platform_debt).toBe(0);
    expect(data.receipt.status).toBe('pending_review');
    expect(data.receipt.amount_ars).toBe(5000);
    expect(data.receipt.debt_before_ars).toBe(5000);
    expect(data.receipt.file_url).toContain('commission-receipts/');
    expect(testStorage.lastUploadOptions[0]?.path).toContain('commission-receipts/');

    const db = getDb();
    const [driver] = await db
      .select({
        platform_debt: drivers.platform_debt,
        commission_fraud_block: drivers.commission_fraud_block,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(Number(driver.platform_debt)).toBe(0);
    expect(driver.commission_fraud_block).toBe(false);

    const { status: listStatus, data: listData } = await request(
      'GET',
      '/api/drivers/me/commission-receipts',
      undefined,
      token,
    );
    expect(listStatus).toBe(200);
    expect(Array.isArray(listData)).toBe(true);
    expect(listData.length).toBe(1);
    expect(listData[0].status).toBe('pending_review');
  });

  test('amount below debt returns 400 AMOUNT_BELOW_DEBT', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await seedPayoutConfig();
    await approveForOnline(driverId, 5000);
    setStorageForTesting(createTestStorage());

    const { status, data } = await postReceipt(token, 4999);
    expect(status).toBe(400);
    expect(data.error.code).toBe('AMOUNT_BELOW_DEBT');
  });

  test('no debt returns 400 NO_COMMISSION_DEBT', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await seedPayoutConfig();
    await approveForOnline(driverId, 0);
    setStorageForTesting(createTestStorage());

    const { status, data } = await postReceipt(token, 1000);
    expect(status).toBe(400);
    expect(data.error.code).toBe('NO_COMMISSION_DEBT');
  });

  test('second pending receipt returns 409 RECEIPT_PENDING', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await seedPayoutConfig();
    await approveForOnline(driverId, 5000);
    setStorageForTesting(createTestStorage());

    const first = await postReceipt(token, 5000);
    expect(first.status).toBe(200);

    const db = getDb();
    await db.update(drivers).set({ platform_debt: 3000 }).where(eq(drivers.id, driverId));

    const second = await postReceipt(token, 3000);
    expect(second.status).toBe(409);
    expect(second.data.error.code).toBe('RECEIPT_PENDING');
  });

  test('missing payout config returns 503 PAYOUT_ACCOUNT_NOT_CONFIGURED', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await approveForOnline(driverId, 5000);
    setStorageForTesting(createTestStorage());

    const { status, data } = await postReceipt(token, 5000);
    expect(status).toBe(503);
    expect(data.error.code).toBe('PAYOUT_ACCOUNT_NOT_CONFIGURED');
  });

  test('after clear, PUT /me/online succeeds under other gates', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await seedPayoutConfig();
    await approveForOnline(driverId, 12000);
    setStorageForTesting(createTestStorage());

    const blocked = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(blocked.status).toBe(409);
    expect(blocked.data.error.code).toBe('COMMISSION_DEBT_CAP');

    const posted = await postReceipt(token, 12000);
    expect(posted.status).toBe(200);

    const online = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(online.status).toBe(200);
    expect(online.data.is_online).toBe(true);
  });

  test('commission_fraud_block returns 409 COMMISSION_FRAUD_BLOCK', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await approveForOnline(driverId, 0);
    const db = getDb();
    await db
      .update(drivers)
      .set({ commission_fraud_block: true })
      .where(eq(drivers.id, driverId));

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(status).toBe(409);
    expect(data.error.code).toBe('COMMISSION_FRAUD_BLOCK');
  });

  test('receipt upload does not clear commission_fraud_block', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await seedPayoutConfig();
    await approveForOnline(driverId, 5000);
    const db = getDb();
    await db
      .update(drivers)
      .set({ commission_fraud_block: true })
      .where(eq(drivers.id, driverId));
    setStorageForTesting(createTestStorage());

    const { status } = await postReceipt(token, 5000);
    expect(status).toBe(200);

    const [driver] = await db
      .select({
        platform_debt: drivers.platform_debt,
        commission_fraud_block: drivers.commission_fraud_block,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(Number(driver.platform_debt)).toBe(0);
    expect(driver.commission_fraud_block).toBe(true);

    const online = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(online.status).toBe(409);
    expect(online.data.error.code).toBe('COMMISSION_FRAUD_BLOCK');
  });

  test('failed tx after upload deletes orphaned storage object', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await seedPayoutConfig();
    await approveForOnline(driverId, 5000);
    const db = getDb();
    const base = createTestStorage();
    // Simulate race: another request wins the pending slot after our upload.
    const raceStorage: TestStorage = {
      ...base,
      async uploadFile(file, path, options) {
        const url = await base.uploadFile(file, path, options);
        await db.insert(driverCommissionReceipts).values({
          driver_id: driverId,
          amount_ars: 1,
          debt_before_ars: 1,
          file_url: 'https://example.supabase.co/storage/v1/object/public/driver-documents/race.jpg',
          status: 'pending_review',
        });
        return url;
      },
    };
    setStorageForTesting(raceStorage);

    const { status, data } = await postReceipt(token, 5000);
    expect(status).toBe(409);
    expect(data.error.code).toBe('RECEIPT_PENDING');
    expect(base.deleted.length).toBeGreaterThanOrEqual(1);
  });
});

describe('isMissingOnboardingVehicleSchemaError (wabdd schema drift #451–#453)', () => {
  test('detects only known onboarding cols — not arbitrary drivers/vehicles columns', () => {
    expect(
      isMissingOnboardingVehicleSchemaError(
        new Error('column drivers.license_category does not exist'),
      ),
    ).toBe(true);
    expect(
      isMissingOnboardingVehicleSchemaError(
        new Error('column vehicles.insurance_coverage_type does not exist'),
      ),
    ).toBe(true);
    expect(
      isMissingOnboardingVehicleSchemaError(new Error('column vehicles.engine_cc does not exist')),
    ).toBe(true);
    expect(
      isMissingOnboardingVehicleSchemaError(
        new Error('column drivers.license_professional_status does not exist'),
      ),
    ).toBe(true);
    // Future required col on same tables must NOT be treated as benign drift.
    expect(
      isMissingOnboardingVehicleSchemaError(
        new Error('column drivers.some_future_required_col does not exist'),
      ),
    ).toBe(false);
    expect(
      isMissingOnboardingVehicleSchemaError(
        new Error('column vehicles.brand does not exist'),
      ),
    ).toBe(false);
    expect(
      isMissingOnboardingVehicleSchemaError(
        Object.assign(new Error('undefined_column'), { code: '42703' }),
      ),
    ).toBe(false);
    expect(isMissingOnboardingVehicleSchemaError(new Error('connection refused'))).toBe(false);
  });

  test('GET /me/status still 200 when license cols present (happy path regression)', async () => {
    const { token } = await fullOnboarding('+549****8801', 'testPass123');
    const { status, data } = await request('GET', '/api/drivers/me/status', undefined, token);
    expect(status).toBe(200);
    expect(data.step).toBe('documents');
  });
});
