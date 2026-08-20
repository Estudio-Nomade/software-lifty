import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverLocations, drivers } from '../../shared/db/schema';

export async function getDriverIdByUserId(userId: string): Promise<string> {
  const [driver] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.user_id, userId))
    .limit(1);

  if (!driver) throw new Error('Driver profile not found');
  return driver.id;
}

export async function markDriverSeen(driverId: string) {
  await db.update(drivers).set({ last_heartbeat: new Date() }).where(eq(drivers.id, driverId));
}

export async function upsertLocation(driverId: string, lat: number, lng: number, heading?: number) {
  await db
    .insert(driverLocations)
    .values({
      driver_id: driverId,
      lat,
      lng,
      heading: heading ?? null,
    })
    .onConflictDoUpdate({
      target: driverLocations.driver_id,
      set: {
        lat,
        lng,
        heading: heading ?? null,
        updated_at: new Date(),
      },
    });
}

export async function findNearbyOnlineDrivers(lat: number, lng: number, radiusKm: number) {
  const haversine = sql`(
    6371 * acos(
      cos(radians(${lat})) * cos(radians(${driverLocations.lat})) *
      cos(radians(${driverLocations.lng}) - radians(${lng})) +
      sin(radians(${lat})) * sin(radians(${driverLocations.lat}))
    )
  )`;

  return db
    .select({
      driver_id: driverLocations.driver_id,
      lat: driverLocations.lat,
      lng: driverLocations.lng,
      heading: driverLocations.heading,
    })
    .from(driverLocations)
    .innerJoin(drivers, eq(drivers.id, driverLocations.driver_id))
    .where(and(eq(drivers.is_online, true), sql`${haversine} <= ${radiusKm}`));
}
