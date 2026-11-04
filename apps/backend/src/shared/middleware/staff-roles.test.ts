process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { db } from '../db/client';
import { drivers, passengerProfiles, users } from '../db/schema';
import { createTestAuthPlugin, createTestToken } from '../testing/utils';
import { deriveRole } from './auth';

let app: any;
let n = 0;

async function makeUser(role: string, opts?: { driver?: boolean; passenger?: boolean }) {
  n++;
  const id = `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
  await db.insert(users).values({
    id,
    role,
    full_name: 'Staff Test',
    phone: `+549262${String(n).padStart(6, '0')}`,
  });
  if (opts?.driver) await db.insert(drivers).values({ user_id: id, status: 'step1' });
  if (opts?.passenger) await db.insert(passengerProfiles).values({ user_id: id });
  return id;
}

async function call(method: string, path: string, token: string, body?: object) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-forwarded-for': `10.1.0.${(n % 254) + 1}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  return res.status as number;
}

beforeAll(() => {
  app = createApp(createTestAuthPlugin());
});

beforeEach(async () => {
  await db.delete(passengerProfiles);
  await db.delete(drivers);
  await db.delete(users);
});

describe('staff roles beat driver/passenger profiles', () => {
  test.each(['admin', 'transit'])('deriveRole keeps %s even with both profiles', async (role) => {
    const id = await makeUser(role, { driver: true, passenger: true });
    expect(await deriveRole(id)).toBe(role);
  });

  test('deriveRole still returns both/driver/passenger for non-staff', async () => {
    expect(await deriveRole(await makeUser('driver', { driver: true, passenger: true }))).toBe('both');
    expect(await deriveRole(await makeUser('driver', { driver: true }))).toBe('driver');
    expect(await deriveRole(await makeUser('passenger', { passenger: true }))).toBe('passenger');
  });

  test.each(['admin', 'transit'])('%s cannot auto-create a passenger profile', async (role) => {
    const id = await makeUser(role);
    const token = createTestToken(id);
    expect(await call('GET', '/api/passenger/trips/active', token)).toBe(403);
    expect(await call('POST', '/api/passenger/register', token, {})).toBe(403);
    expect(await call('GET', '/api/passenger/profile', token)).toBe(403);
    const rows = await db.select().from(passengerProfiles);
    expect(rows).toHaveLength(0);
  });

  test.each(['admin', 'transit'])('%s cannot start driver onboarding', async (role) => {
    const id = await makeUser(role);
    const token = createTestToken(id);
    expect(await call('PUT', '/api/drivers/me', token, { first_name: 'X' })).toBe(403);
    const rows = await db.select().from(drivers);
    expect(rows).toHaveLength(0);
  });

  test('regular user still gets a passenger profile on demand', async () => {
    const id = await makeUser('driver');
    expect(await call('GET', '/api/passenger/trips/active', createTestToken(id))).toBe(200);
  });
});
