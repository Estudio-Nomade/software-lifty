process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, resetDb } from '../db/client';
import { driverLocations, drivers, trips, users } from '../db/schema';
import { cleanupStaleDrivers } from './cleanup';

const db = getDb();

async function truncateTables() {
  await db.delete(trips);
  await db.delete(driverLocations);
  await db.delete(drivers);
  await db.delete(users);
}

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('cleanupStaleDrivers', () => {
  test('marks offline driver with stale last_heartbeat', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492611111000', role: 'driver', full_name: 'Test' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({
        user_id: user.id,
        is_online: true,
        last_heartbeat: new Date(Date.now() - 11 * 60 * 1000),
      })
      .returning({ id: drivers.id });

    const result = await cleanupStaleDrivers();
    expect(result.markedOffline).toBe(1);

    const [updated] = await db
      .select({ is_online: drivers.is_online })
      .from(drivers)
      .where(eq(drivers.id, driver.id))
      .limit(1);
    expect(updated.is_online).toBe(false);
  });

  test('does not affect driver with recent heartbeat', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492611111001', role: 'driver', full_name: 'Test' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, is_online: true, last_heartbeat: new Date() })
      .returning({ id: drivers.id });

    const result = await cleanupStaleDrivers();
    expect(result.markedOffline).toBe(0);

    const [updated] = await db
      .select({ is_online: drivers.is_online })
      .from(drivers)
      .where(eq(drivers.id, driver.id))
      .limit(1);
    expect(updated.is_online).toBe(true);
  });

  test('does not affect already offline driver', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492611111002', role: 'driver', full_name: 'Test' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, is_online: false, last_heartbeat: new Date(Date.now() - 120_000) })
      .returning({ id: drivers.id });

    const result = await cleanupStaleDrivers();
    expect(result.markedOffline).toBe(0);

    const [updated] = await db
      .select({ is_online: drivers.is_online })
      .from(drivers)
      .where(eq(drivers.id, driver.id))
      .limit(1);
    expect(updated.is_online).toBe(false);
  });

  test('does not affect driver without last_heartbeat', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492611111003', role: 'driver', full_name: 'Test' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, is_online: true })
      .returning({ id: drivers.id });

    const result = await cleanupStaleDrivers();
    expect(result.markedOffline).toBe(0);

    const [updated] = await db
      .select({ is_online: drivers.is_online })
      .from(drivers)
      .where(eq(drivers.id, driver.id))
      .limit(1);
    expect(updated.is_online).toBe(true);
  });

  test('does not affect driver with active trip', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492611111004', role: 'driver', full_name: 'Test' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({
        user_id: user.id,
        is_online: true,
        last_heartbeat: new Date(Date.now() - 11 * 60 * 1000),
      })
      .returning({ id: drivers.id });
    await db.insert(trips).values({
      driver_id: driver.id,
      status: 'in_trip',
      origin_lat: 0,
      origin_lng: 0,
      dest_lat: 0,
      dest_lng: 0,
      total_fare: 0,
      platform_fee: 0,
      driver_earnings: 0,
    });

    const result = await cleanupStaleDrivers();
    expect(result.markedOffline).toBe(0);

    const [updated] = await db
      .select({ is_online: drivers.is_online })
      .from(drivers)
      .where(eq(drivers.id, driver.id))
      .limit(1);
    expect(updated.is_online).toBe(true);
  });
});

describe('cleanup stale driver locations', () => {
  test('deletes locations older than 24 hours', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492611112000', role: 'driver', full_name: 'Test' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, is_online: false })
      .returning({ id: drivers.id });

    await db.insert(driverLocations).values({
      driver_id: driver.id,
      lat: -32.89,
      lng: -68.84,
      updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const result = await cleanupStaleDrivers();
    expect(result.cleanedLocations).toBe(1);

    const [loc] = await db
      .select({ driver_id: driverLocations.driver_id })
      .from(driverLocations)
      .where(eq(driverLocations.driver_id, driver.id))
      .limit(1);
    expect(loc).toBeUndefined();
  });

  test('keeps recent locations', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492611112001', role: 'driver', full_name: 'Test' })
      .returning({ id: users.id });
    const [driver] = await db
      .insert(drivers)
      .values({ user_id: user.id, is_online: false })
      .returning({ id: drivers.id });

    await db.insert(driverLocations).values({
      driver_id: driver.id,
      lat: -32.89,
      lng: -68.84,
      updated_at: new Date(),
    });

    const result = await cleanupStaleDrivers();
    expect(result.cleanedLocations).toBe(0);

    const [loc] = await db
      .select({ driver_id: driverLocations.driver_id })
      .from(driverLocations)
      .where(eq(driverLocations.driver_id, driver.id))
      .limit(1);
    expect(loc).toBeDefined();
  });
});
