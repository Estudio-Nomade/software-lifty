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
import { passengerProfiles, users } from '../../shared/db/schema';
import type { StorageProvider } from '../../shared/lib/storage';
import { createTestToken } from '../../shared/testing/utils';
import { setStorageForTesting } from './service';

interface TestStorage extends StorageProvider {
  uploaded: Map<string, string>;
  deleted: string[];
}

function createTestStorage() {
  const uploaded = new Map<string, string>();
  const deleted: string[] = [];
  const storage: TestStorage = {
    uploaded,
    deleted,
    async uploadFile(_file: File, path: string) {
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
  await db.delete(passengerProfiles);
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

async function createPassengerUser(phone: string, fullName = 'Maria Lopez') {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: fullName, email: `${phone.replace(/\D/g, '')}@example.com`, role: 'passenger' })
    .returning({ id: users.id });
  return { token: await createTestToken(user.id), userId: user.id };
}

async function registerPassenger(phone: string, fullName = 'Maria Lopez') {
  const { token, userId } = await createPassengerUser(phone, fullName);
  await request('POST', '/api/passenger/register', { phone }, token);
  return { token, userId };
}

beforeAll(() => {
  baseStorage = createTestStorage();
  setStorageForTesting(baseStorage);
  app = createApp();
});

beforeEach(async () => {
  await truncateTables();
  baseStorage.uploaded.clear();
  baseStorage.deleted.length = 0;
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Passenger Profile', () => {
  const phone = '+5492611111111';

  test('GET /profile joins users and returns full_name and email', async () => {
    const { token } = await registerPassenger(phone);

    const { status, data } = await request('GET', '/api/passenger/profile', undefined, token);

    expect(status).toBe(200);
    expect(data.full_name).toBe('Maria Lopez');
    expect(data.email).toBe('5492611111111@example.com');
    expect(data.phone).toBe(phone);
    expect(data.id).toBeString();
  });

  test('GET /profile without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/passenger/profile');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('PUT /profile updates full_name and phone', async () => {
    const { token } = await registerPassenger(phone);

    const { status, data } = await request(
      'PUT',
      '/api/passenger/profile',
      { full_name: 'Nuevo Nombre', phone: '+5492619999999' },
      token,
    );

    expect(status).toBe(200);
    expect(data.full_name).toBe('Nuevo Nombre');
    expect(data.phone).toBe('+5492619999999');

    const db = getDb();
    const [user] = await db
      .select({ full_name: users.full_name, phone: users.phone })
      .from(users)
      .where(eq(users.phone, '+5492619999999'))
      .limit(1);
    expect(user.full_name).toBe('Nuevo Nombre');

    const [profile] = await db
      .select({ phone: passengerProfiles.phone })
      .from(passengerProfiles)
      .where(eq(passengerProfiles.phone, '+5492619999999'))
      .limit(1);
    expect(profile).toBeDefined();
  });

  test('PUT /profile duplicate phone does not overwrite another user', async () => {
    const { token } = await registerPassenger(phone);
    await createPassengerUser('+5492612222222', 'Otro Usuario');

    const { status, data } = await request(
      'PUT',
      '/api/passenger/profile',
      { full_name: 'Sigo Siendo Yo', phone: '+5492612222222' },
      token,
    );

    expect(status).toBe(200);

    const db = getDb();
    const [other] = await db
      .select({ full_name: users.full_name })
      .from(users)
      .where(eq(users.phone, '+5492612222222'))
      .limit(1);
    expect(other.full_name).toBe('Otro Usuario');

    const [me] = await db
      .select({ full_name: users.full_name, phone: users.phone })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    expect(me.phone).toBe(phone);
    expect(me.full_name).toBe('Sigo Siendo Yo');
    expect(data.full_name).toBe('Sigo Siendo Yo');
  });

  test('PUT /profile without auth returns 401', async () => {
    const { status, data } = await request('PUT', '/api/passenger/profile', {
      full_name: 'X',
    });

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('POST /register persists full_name onto users', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({
        phone: '+549****5555',
        email: 'noname@example.com',
        role: 'passenger',
        full_name: null,
      })
      .returning({ id: users.id });
    const token = await createTestToken(user.id);

    const { status } = await request(
      'POST',
      '/api/passenger/register',
      { phone: '+549****5555', full_name: 'Sebastian Vallejo' },
      token,
    );
    expect(status).toBe(200);

    const [row] = await db
      .select({ full_name: users.full_name })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    expect(row.full_name).toBe('Sebastian Vallejo');

    const profile = await request('GET', '/api/passenger/profile', undefined, token);
    expect(profile.status).toBe(200);
    expect(profile.data.full_name).toBe('Sebastian Vallejo');
  });
});

describe('Passenger avatar photo upload', () => {
  const phone = '+5492613333333';

  async function uploadPhoto(token: string) {
    const formData = new FormData();
    formData.append('file', new Blob(['image-data'], { type: 'image/png' }), 'avatar.png');
    const req = new Request('http://localhost/api/passenger/profile/photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const res = await app.handle(req);
    return { status: res.status, data: await res.json() };
  }

  test('POST /profile/photo uploads avatar and sets avatar_url', async () => {
    const { token } = await registerPassenger(phone);

    const { status, data } = await uploadPhoto(token);

    expect(status).toBe(200);
    expect(data.file_url).toBeString();
    expect(data.file_url).toContain('avatars/passenger-');
    expect(data.avatar_url).toBe(data.file_url);

    const { data: profile } = await request('GET', '/api/passenger/profile', undefined, token);
    expect(profile.avatar_url).toBe(data.file_url);
  });

  test('POST /profile/photo replaces old avatar_url on re-upload', async () => {
    const { token } = await registerPassenger(phone);

    const { data: first } = await uploadPhoto(token);
    const { data: second } = await uploadPhoto(token);

    expect(second.file_url).not.toBe(first.file_url);
    expect(baseStorage.deleted.length).toBeGreaterThanOrEqual(1);

    const { data: profile } = await request('GET', '/api/passenger/profile', undefined, token);
    expect(profile.avatar_url).toBe(second.file_url);
  });

  test('POST /profile/photo without auth returns 401', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['data'], { type: 'image/png' }), 'avatar.png');
    const req = new Request('http://localhost/api/passenger/profile/photo', {
      method: 'POST',
      body: formData,
    });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
  });
});
