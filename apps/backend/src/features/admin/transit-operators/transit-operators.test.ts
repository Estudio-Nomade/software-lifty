process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../../index';
import { getDb, resetDb } from '../../../shared/db/client';
import {
  districts,
  drivers,
  passengerProfiles,
  users,
} from '../../../shared/db/schema';
import { createTestToken } from '../../../shared/testing/utils';
import { setAuthAdminClientForTests } from './auth-admin';

let app: ReturnType<typeof createApp>;

const authUsers = new Map<string, { id: string; email: string; password: string; banned?: boolean }>();

function mockAuthAdmin() {
  const client = {
    auth: {
      admin: {
        createUser: mock(async (opts: { email: string; password: string }) => {
          const email = opts.email.toLowerCase();
          if ([...authUsers.values()].some((u) => u.email === email)) {
            return { data: { user: null }, error: { message: 'User already registered' } };
          }
          const id = crypto.randomUUID();
          authUsers.set(id, { id, email, password: opts.password });
          return { data: { user: { id, email } }, error: null };
        }),
        updateUserById: mock(async (id: string, opts: { password?: string; ban_duration?: string }) => {
          const u = authUsers.get(id);
          if (!u) return { data: { user: null }, error: { message: 'not found' } };
          if (opts.password) u.password = opts.password;
          if (opts.ban_duration) u.banned = true;
          return { data: { user: { id } }, error: null };
        }),
        deleteUser: mock(async (id: string) => {
          authUsers.delete(id);
          return { data: { user: null }, error: null };
        }),
      },
    },
  };
  setAuthAdminClientForTests(client as never);
  return client;
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function createAdmin(): Promise<string> {
  const db = getDb();
  const [admin] = await db
    .insert(users)
    .values({ phone: '+5492617000001', role: 'admin', email: 'admin-to@test.com' })
    .returning({ id: users.id });
  return createTestToken(admin.id);
}

async function seedDistrict(name = 'Villa Dolores') {
  const db = getDb();
  const [d] = await db
    .insert(districts)
    .values({ name, province: 'Córdoba', status: 'active' })
    .returning({ id: districts.id, name: districts.name });
  return d;
}

beforeAll(() => {
  mockAuthAdmin();
  app = createApp();
});

beforeEach(async () => {
  authUsers.clear();
  mockAuthAdmin();
  const db = getDb();
  await db.delete(passengerProfiles);
  await db.delete(drivers);
  await db.delete(users);
  await db.delete(districts);
});

afterAll(async () => {
  setAuthAdminClientForTests(null);
  resetDb();
});

describe('Admin transit operators', () => {
  test('non-admin gets 403', async () => {
    const db = getDb();
    const [u] = await db
      .insert(users)
      .values({ phone: '+5492617000099', role: 'driver' })
      .returning({ id: users.id });
    const token = await createTestToken(u.id);
    const { status } = await request('GET', '/api/admin/transit-operators', undefined, token);
    expect(status).toBe(403);
  });

  test('admin creates operator → role transit + district + scrub profiles', async () => {
    const adminToken = await createAdmin();
    const district = await seedDistrict();

    const { status, data } = await request(
      'POST',
      '/api/admin/transit-operators',
      {
        district_id: district.id,
        email: 'villadolores@liftyviajes.com',
        password: 'SecretPass1',
        full_name: 'Tránsito Villa Dolores',
      },
      adminToken,
    );

    expect(status).toBe(201);
    expect(data.email).toBe('villadolores@liftyviajes.com');
    expect(data.password).toBe('SecretPass1');
    expect(data.transit_district_id).toBe(district.id);
    expect(data.district_name).toBe('Villa Dolores');

    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.id, data.id));
    expect(row.role).toBe('transit');
    expect(row.transit_district_id).toBe(district.id);

    const driverRows = await db.select().from(drivers).where(eq(drivers.user_id, data.id));
    const paxRows = await db
      .select()
      .from(passengerProfiles)
      .where(eq(passengerProfiles.user_id, data.id));
    expect(driverRows).toHaveLength(0);
    expect(paxRows).toHaveLength(0);
  });

  test('second operator same district → 409', async () => {
    const adminToken = await createAdmin();
    const district = await seedDistrict();

    await request(
      'POST',
      '/api/admin/transit-operators',
      {
        district_id: district.id,
        email: 'first@liftyviajes.com',
        password: 'SecretPass1',
      },
      adminToken,
    );

    const { status, data } = await request(
      'POST',
      '/api/admin/transit-operators',
      {
        district_id: district.id,
        email: 'second@liftyviajes.com',
        password: 'SecretPass2',
      },
      adminToken,
    );

    expect(status).toBe(409);
    expect(data.error?.code).toBe('CONFLICT');
  });

  test('list operators includes district_name', async () => {
    const adminToken = await createAdmin();
    const district = await seedDistrict('Nono');

    await request(
      'POST',
      '/api/admin/transit-operators',
      { district_id: district.id, email: 'nono@liftyviajes.com', password: 'SecretPass1' },
      adminToken,
    );

    const { status, data } = await request('GET', '/api/admin/transit-operators', undefined, adminToken);
    expect(status).toBe(200);
    expect(data.items.length).toBe(1);
    expect(data.items[0].district_name).toBe('Nono');
    expect(data.items[0].email).toBe('nono@liftyviajes.com');
  });

  test('PATCH reassign district', async () => {
    const adminToken = await createAdmin();
    const d1 = await seedDistrict('Villa Dolores');
    const d2 = await seedDistrict('Mina Clavero');

    const created = await request(
      'POST',
      '/api/admin/transit-operators',
      { district_id: d1.id, email: 'move@liftyviajes.com', password: 'SecretPass1' },
      adminToken,
    );

    const { status, data } = await request(
      'PATCH',
      `/api/admin/transit-operators/${created.data.id}`,
      { district_id: d2.id },
      adminToken,
    );

    expect(status).toBe(200);
    expect(data.transit_district_id).toBe(d2.id);
    expect(data.district_name).toBe('Mina Clavero');
  });

  test('reset password returns new pass once', async () => {
    const adminToken = await createAdmin();
    const district = await seedDistrict();
    const created = await request(
      'POST',
      '/api/admin/transit-operators',
      { district_id: district.id, email: 'reset@liftyviajes.com', password: 'SecretPass1' },
      adminToken,
    );

    const { status, data } = await request(
      'POST',
      `/api/admin/transit-operators/${created.data.id}/password`,
      { password: 'NewSecret99' },
      adminToken,
    );

    expect(status).toBe(200);
    expect(data.password).toBe('NewSecret99');
    expect(authUsers.get(created.data.id)?.password).toBe('NewSecret99');
  });

  test('short password → 400', async () => {
    const adminToken = await createAdmin();
    const district = await seedDistrict();
    const { status } = await request(
      'POST',
      '/api/admin/transit-operators',
      { district_id: district.id, email: 'short@liftyviajes.com', password: 'abc' },
      adminToken,
    );
    expect(status).toBe(400);
  });

  test('GET /admin/districts lists active', async () => {
    const adminToken = await createAdmin();
    await seedDistrict('Las Calles');
    const { status, data } = await request('GET', '/api/admin/districts', undefined, adminToken);
    expect(status).toBe(200);
    expect(data.items.some((d: { name: string }) => d.name === 'Las Calles')).toBe(true);
  });

  test('create strips existing driver/passenger rows for same user id path', async () => {
    const adminToken = await createAdmin();
    const district = await seedDistrict();
    // pre-create auth-linked user with driver row via mock: create then we insert driver after
    // Simulate: operator create succeeds; scrub runs — we insert driver with same id before create is hard.
    // Instead: create operator, manually add driver row, re-create is blocked by email.
    // Verify scrub on create by planting driver on a reserved uuid via direct auth mock path:
    const plantedId = crypto.randomUUID();
    authUsers.set(plantedId, {
      id: plantedId,
      email: 'scrub@liftyviajes.com',
      password: 'x',
    });

    // Override createUser once to return planted id
    setAuthAdminClientForTests({
      auth: {
        admin: {
          createUser: mock(async () => ({
            data: { user: { id: plantedId, email: 'scrub@liftyviajes.com' } },
            error: null,
          })),
          updateUserById: mock(async () => ({ data: { user: { id: plantedId } }, error: null })),
          deleteUser: mock(async () => ({ data: { user: null }, error: null })),
        },
      },
    } as never);

    const db = getDb();
    await db.insert(users).values({
      id: plantedId,
      email: 'scrub-pre@liftyviajes.com',
      role: 'driver',
      phone: '+5492617111111',
    });
    await db.insert(drivers).values({
      user_id: plantedId,
      status: 'approved',
    });

    const { status, data } = await request(
      'POST',
      '/api/admin/transit-operators',
      {
        district_id: district.id,
        email: 'scrub@liftyviajes.com',
        password: 'SecretPass1',
      },
      adminToken,
    );

    expect(status).toBe(201);
    const remaining = await db.select().from(drivers).where(eq(drivers.user_id, data.id));
    expect(remaining).toHaveLength(0);
    const [u] = await db.select().from(users).where(eq(users.id, plantedId));
    expect(u.role).toBe('transit');
  });
});
