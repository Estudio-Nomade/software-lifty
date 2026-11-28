import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverLocations, drivers } from '../../shared/db/schema';
import { broadcastTripLocation } from '../../shared/lib/broadcast';
import { haversineDistance, snapToRoad } from '../../shared/lib/geo';
import { logger } from '../../shared/lib/logger';
import { getDriverActiveTrip } from '../../shared/lib/trip-utils';
import { type FixInput, evaluateFix } from './quality';

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

export async function upsertLocation(
  driverId: string,
  lat: number,
  lng: number,
  heading?: number,
  quality?: { accuracy?: number | null; speed?: number | null; fixAt?: number | null },
) {
  const q = {
    accuracy: quality?.accuracy ?? null,
    speed: quality?.speed ?? null,
    fix_at: quality?.fixAt != null ? new Date(quality.fixAt) : null,
  };
  await db
    .insert(driverLocations)
    .values({ driver_id: driverId, lat, lng, heading: heading ?? null, ...q })
    .onConflictDoUpdate({
      target: driverLocations.driver_id,
      set: { lat, lng, heading: heading ?? null, ...q, updated_at: new Date() },
    });
}

/**
 * Consecutive "jump" rejects that agree with each other (same ~100 m) mean the stored fix
 * was the outlier, not the new ones. In-memory per process: losing it only delays recovery.
 * shortcut: not shared across instances, move to Redis if the backend scales out.
 */
const JUMP_STREAK_ACCEPT = 3;
const JUMP_STREAK_RADIUS_KM = 0.1;
const jumpStreaks = new Map<string, { lat: number; lng: number; count: number }>();

function jumpStreakConfirmed(driverId: string, lat: number, lng: number): boolean {
  const cur = jumpStreaks.get(driverId);
  const same = cur && haversineDistance(cur.lat, cur.lng, lat, lng) <= JUMP_STREAK_RADIUS_KM;
  const count = same ? cur.count + 1 : 1;
  jumpStreaks.set(driverId, { lat, lng, count });
  return count >= JUMP_STREAK_ACCEPT;
}

/**
 * Single entry point for every driver position (WS, POST /location/update, heartbeat):
 * drops low-quality fixes, otherwise stores them and pushes to the passenger on a live trip.
 */
export async function ingestDriverFix(
  driverId: string,
  fix: FixInput & { heading?: number | null },
): Promise<{ accepted: boolean; reason?: string }> {
  const [prevRow] = await db
    .select({
      lat: driverLocations.lat,
      lng: driverLocations.lng,
      fix_at: driverLocations.fix_at,
      updated_at: driverLocations.updated_at,
    })
    .from(driverLocations)
    .where(eq(driverLocations.driver_id, driverId))
    .limit(1);
  const prev = prevRow
    ? {
        lat: prevRow.lat,
        lng: prevRow.lng,
        fixAt: (prevRow.fix_at ?? prevRow.updated_at).getTime(),
      }
    : null;
  const onTrip = (await getDriverActiveTrip(driverId)) != null;

  const now = Date.now();
  let verdict = evaluateFix(fix, { onTrip, prev, now });
  if (!verdict.ok && verdict.reason === 'jump' && jumpStreakConfirmed(driverId, fix.lat, fix.lng)) {
    verdict = evaluateFix(fix, { onTrip, prev: null, now });
  }
  if (verdict.ok) jumpStreaks.delete(driverId);
  if (!verdict.ok) {
    logger.debug('[location] fix rejected', { driverId, reason: verdict.reason });
    return { accepted: false, reason: verdict.reason };
  }

  const heading = fix.heading ?? undefined;
  await upsertLocation(driverId, fix.lat, fix.lng, heading, {
    accuracy: fix.accuracy,
    speed: fix.speed,
    fixAt: verdict.fixAt,
  });
  await publishDriverLocationIfOnTrip(driverId, fix.lat, fix.lng, heading, fix.accuracy);
  return { accepted: true };
}

/** After a location upsert, push to the passenger if the driver is on a live trip. */
export async function publishDriverLocationIfOnTrip(
  driverId: string,
  lat: number,
  lng: number,
  heading?: number | null,
  accuracy?: number | null,
) {
  const active = await getDriverActiveTrip(driverId);
  if (!active) return;
  // Opt-in: needs a self-hosted OSRM; the public one cannot take one request per fix.
  const point =
    process.env.OSRM_SNAP_ENABLED === 'true' ? await snapToRoad(lat, lng, accuracy) : { lat, lng };
  broadcastTripLocation(active.id, {
    lat: point.lat,
    lng: point.lng,
    heading: heading ?? undefined,
    driver_id: driverId,
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
