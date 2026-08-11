import { and, eq, inArray, isNotNull, lt, ne, notInArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { driverLocations, drivers, trips } from '../db/schema';
import { logger } from './logger';

const ADVISORY_LOCK_KEY = 42;
const STALE_THRESHOLD_MS = 60_000;

const ACTIVE_TRIP_STATUSES = [
  'request_received',
  'accepted',
  'driver_arrived',
  'in_progress',
] as const;

const LOCATION_STALE_HOURS = 24;

export async function cleanupStaleDrivers(): Promise<{
  markedOffline: number;
  cleanedLocations: number;
}> {
  try {
    const lockResult = await db.execute(
      sql.raw(`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`),
    );
    const rows = lockResult.rows as { locked: boolean }[];

    if (!rows[0]?.locked) {
      return { markedOffline: 0, cleanedLocations: 0 };
    }

    try {
      const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

      const activeTripDriverIds = await db
        .select({ driver_id: trips.driver_id })
        .from(trips)
        .where(inArray(trips.status, ACTIVE_TRIP_STATUSES));

      const excludedIds = activeTripDriverIds
        .map((t) => t.driver_id)
        .filter((id): id is string => id !== null);

      const conditions = [
        eq(drivers.is_online, true),
        isNotNull(drivers.last_heartbeat),
        lt(drivers.last_heartbeat, cutoff),
      ];
      if (excludedIds.length > 0) {
        conditions.push(notInArray(drivers.id, excludedIds));
      }

      const result = await db
        .update(drivers)
        .set({ is_online: false, updated_at: new Date() })
        .where(and(...conditions));

      const markedOffline = (result as unknown as { rowCount?: number }).rowCount ?? 0;

      if (markedOffline > 0) {
        logger.info(`[CLEANUP] Marked ${markedOffline} stale drivers offline`);
      }

      const locationCutoff = new Date(Date.now() - LOCATION_STALE_HOURS * 60 * 60 * 1000);
      const deletedResult = await db
        .delete(driverLocations)
        .where(lt(driverLocations.updated_at, locationCutoff));
      const cleanedLocations = (deletedResult as unknown as { rowCount?: number }).rowCount ?? 0;

      if (cleanedLocations > 0) {
        logger.info(`[CLEANUP] Cleaned ${cleanedLocations} stale driver locations`);
      }

      return { markedOffline, cleanedLocations };
    } finally {
      await db.execute(sql.raw(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`));
    }
  } catch (err) {
    logger.error('[CLEANUP] Failed to run stale driver cleanup', {
      error: (err as Error).message,
    });
    return { markedOffline: 0, cleanedLocations: 0 };
  }
}

let cleanupHandle: ReturnType<typeof setInterval> | null = null;

export function startStaleDriverCleanup(intervalMs = 15_000): void {
  if (cleanupHandle) return;

  cleanupHandle = setInterval(() => {
    cleanupStaleDrivers().catch(() => {});
  }, intervalMs);

  logger.info(`[CLEANUP] Started stale driver cleanup (interval: ${intervalMs}ms)`);
}

export function stopStaleDriverCleanup(): void {
  if (cleanupHandle) {
    clearInterval(cleanupHandle);
    cleanupHandle = null;
    logger.info('[CLEANUP] Stopped stale driver cleanup');
  }
}
