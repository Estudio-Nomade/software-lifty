process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { trips, users } from './schema';

const base = {
  origin_lat: -31.9,
  origin_lng: -65.1,
  dest_lat: -31.95,
  dest_lng: -65.17,
  total_fare: 1000,
  platform_fee: 100,
  driver_earnings: 900,
};

beforeEach(async () => {
  const db = getDb();
  await db.delete(trips);
  await db.delete(users);
});

describe('trips.passenger_id FK -> users.id', () => {
  test('rejects a trip whose passenger_id is not a users.id', async () => {
    const db = getDb();
    const attempt = async () => {
      await db
        .insert(trips)
        .values({ ...base, passenger_id: '00000000-0000-4000-8000-0000000000aa' });
    };
    await expect(attempt()).rejects.toThrow();
  });

  test('accepts a null passenger_id and a real users.id', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ phone: '+5492614000001', role: 'passenger' }).returning();
    await db.insert(trips).values({ ...base, passenger_id: null });
    await db.insert(trips).values({ ...base, passenger_id: u.id });
    expect(await db.select().from(trips)).toHaveLength(2);
  });

  test('deleting the user keeps the trip and nulls passenger_id', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ phone: '+5492614000002', role: 'passenger' }).returning();
    const [t] = await db.insert(trips).values({ ...base, passenger_id: u.id }).returning();
    await db.delete(users).where(eq(users.id, u.id));
    const [after] = await db.select().from(trips).where(eq(trips.id, t.id));
    expect(after.passenger_id).toBeNull();
  });
});
