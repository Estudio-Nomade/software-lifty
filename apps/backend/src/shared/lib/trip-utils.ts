import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { trips } from '../db/schema';

const ACTIVE_TRIP_STATUSES = ['accepted', 'en_route', 'waiting', 'in_trip'] as const;

interface CacheEntry {
  tripId: string | null;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5000;
const NEGATIVE_CACHE_TTL_MS = 2000;

export async function getDriverActiveTrip(driverId: string): Promise<{ id: string } | null> {
  const cached = cache.get(driverId);
  if (cached && cached.expires > Date.now()) {
    return cached.tripId ? { id: cached.tripId } : null;
  }

  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.driver_id, driverId), inArray(trips.status, ACTIVE_TRIP_STATUSES)))
    .limit(1);

  const ttl = trip ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
  cache.set(driverId, {
    tripId: trip?.id ?? null,
    expires: Date.now() + ttl,
  });

  return trip ?? null;
}

export function invalidateTripCache(driverId: string): void {
  cache.delete(driverId);
}
