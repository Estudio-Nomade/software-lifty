process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { drivers, passengerProfiles, users } from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';

let app: any;
let n = 0;

async function mkUser(opts: { passenger?: boolean; driver?: boolean }) {
  const db = getDb();
  n++;
  const [u] = await db
    .insert(users)
    .values({ phone: `+549263${String(n).padStart(6, '0')}`, full_name: 'Dual', role: 'driver' })
    .returning({ id: users.id });
  if (opts.passenger) await db.insert(passengerProfiles).values({ user_id: u.id });
  if (opts.driver) await db.insert(drivers).values({ user_id: u.id, status: 'step1' });
  return createTestToken(u.id);
}

async function getStatus(token: string) {
  const res = await app.handle(
    new Request('http://localhost/api/drivers/me/status', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  return { status: res.status as number, data: await res.json() };
}

beforeAll(() => {
  app = createApp(createTestAuthPlugin());
});

beforeEach(async () => {
  const db = getDb();
  await db.delete(passengerProfiles);
  await db.delete(drivers);
  await db.delete(users);
});

afterAll(() => resetDb());

describe('GET /drivers/me/status has_passenger_profile signal', () => {
  test('passenger without driver row: pending/profile + has_passenger_profile=true', async () => {
    const { status, data } = await getStatus(await mkUser({ passenger: true }));
    expect(status).toBe(200);
    expect(data.status).toBe('pending');
    expect(data.step).toBe('profile');
    expect(data.has_passenger_profile).toBe(true);
  });

  test('brand-new user without any profile: has_passenger_profile=false', async () => {
    const { data } = await getStatus(await mkUser({}));
    expect(data.step).toBe('profile');
    expect(data.has_passenger_profile).toBe(false);
  });

  test('user that already has a driver row is unaffected (no passenger notice)', async () => {
    const { data } = await getStatus(await mkUser({ passenger: true, driver: true }));
    expect(data.has_passenger_profile).not.toBe(true);
  });
});
