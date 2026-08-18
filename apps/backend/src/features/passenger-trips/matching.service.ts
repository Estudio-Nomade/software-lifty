import { and, eq, notInArray, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverLocations, drivers, tripEvents, trips, users } from '../../shared/db/schema';
import { haversineDistance } from '../../shared/lib/geo';
import { logger } from '../../shared/lib/logger';
import { sendPushToUser } from '../../shared/lib/push';
import { listBlockedDriverIds } from '../cancellations/blocks';
import { getPassengerVisibility } from '../cancellations/metrics';
import { getCancellationConfig } from '../cancellations/service';
import { broadcastTripRequest } from '../trips/service';

const OFFER_TIMEOUT_MS = 20_000;

interface NearbyDriver {
  driverId: string;
  userId: string;
  distance: number;
  fullName: string;
}

export interface MatchOptions {
  excludeDriverIds?: string[];
}

export async function findNearbyDrivers(
  originLat: number,
  originLng: number,
  radiusKm = 5,
  excludeDriverIds: string[] = [],
): Promise<NearbyDriver[]> {
  const conditions = [
    eq(drivers.is_online, true),
    sql`${driverLocations.lat} IS NOT NULL`,
    sql`${driverLocations.lng} IS NOT NULL`,
  ];
  const blocked = await listBlockedDriverIds();
  const excluded = [...new Set([...excludeDriverIds, ...blocked])];
  if (excluded.length > 0) {
    conditions.push(notInArray(drivers.id, excluded));
  }

  const rows = await db
    .select({
      driverId: drivers.id,
      userId: users.id,
      fullName: users.full_name,
      lat: driverLocations.lat,
      lng: driverLocations.lng,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.user_id, users.id))
    .innerJoin(driverLocations, eq(drivers.id, driverLocations.driver_id))
    .where(and(...conditions));

  return rows
    .map((d) => ({
      driverId: d.driverId,
      userId: d.userId,
      fullName: d.fullName ?? 'Conductor',
      distance: haversineDistance(originLat, originLng, d.lat!, d.lng!),
    }))
    .filter((d) => d.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);
}

export async function matchAndBroadcast(
  trip: {
    id: string;
    passenger_id?: string | null;
    origin_address?: string | null;
    dest_address?: string | null;
    total_fare?: number | null;
    origin_lat: number;
    origin_lng: number;
    dest_lat: number;
    dest_lng: number;
    distance_km?: number | null;
    duration_minutes?: number | null;
  },
  options: MatchOptions = {},
) {
  const nearby = await findNearbyDrivers(
    trip.origin_lat,
    trip.origin_lng,
    5,
    options.excludeDriverIds ?? [],
  );

  if (nearby.length === 0) {
    logger.info('[matchAndBroadcast] No nearby drivers found', { tripId: trip.id });
    return { drivers_found: 0 };
  }

  const driver = nearby[0];
  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_MS);

  const assigned = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(trips)
      .set({
        driver_id: driver.driverId,
        status: 'offered',
        expires_at: expiresAt,
        updated_at: new Date(),
      })
      .where(and(eq(trips.id, trip.id), eq(trips.status, 'pending')))
      .returning();

    if (!updated) return null;

    await tx.insert(tripEvents).values({
      trip_id: trip.id,
      from_status: 'pending',
      to_status: 'offered',
    });

    return updated;
  });

  if (!assigned) {
    logger.info('[matchAndBroadcast] Trip no longer pending, skipped', { tripId: trip.id });
    return { drivers_found: 0 };
  }

  let offerPayload: Record<string, unknown> = assigned;
  if (trip.passenger_id) {
    const config = await getCancellationConfig();
    const vis = await getPassengerVisibility(trip.passenger_id, config);
    offerPayload = {
      ...assigned,
      passenger_cancel_visible: vis.visible,
      passenger_cancel_rate_pct: vis.ratePct,
      passenger_cancel_count_30d: vis.count,
    };
  }

  broadcastTripRequest(driver.driverId, offerPayload);

  sendPushToUser(driver.userId, {
    title: 'Nuevo viaje',
    body: `Viaje solicitado de ${assigned.origin_address ?? 'origen'} a ${assigned.dest_address ?? 'destino'} — $${assigned.total_fare ?? 'N/A'}`,
    data: { trip_id: trip.id, type: 'trip:request' },
  });

  logger.info('[matchAndBroadcast] Assigned nearest driver', {
    tripId: trip.id,
    driverId: driver.driverId,
  });

  return { drivers_found: 1, driver_id: driver.driverId };
}
