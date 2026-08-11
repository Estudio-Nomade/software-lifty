import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverLocations, drivers, users } from '../../shared/db/schema';
import { haversineDistance } from '../../shared/lib/geo';
import { logger } from '../../shared/lib/logger';
import { sendPushToUser } from '../../shared/lib/push';
import { broadcastTripRequest } from '../trips/service';

interface NearbyDriver {
  driverId: string;
  userId: string;
  distance: number;
  fullName: string;
}

export async function findNearbyDrivers(
  originLat: number,
  originLng: number,
  radiusKm = 5,
): Promise<NearbyDriver[]> {
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
    .where(
      and(
        eq(drivers.is_online, true),
        sql`${driverLocations.lat} IS NOT NULL`,
        sql`${driverLocations.lng} IS NOT NULL`,
      ),
    );

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

export async function matchAndBroadcast(trip: {
  id: string;
  origin_address?: string | null;
  dest_address?: string | null;
  total_fare?: number | null;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  distance_km?: number | null;
  duration_minutes?: number | null;
}) {
  const nearby = await findNearbyDrivers(trip.origin_lat, trip.origin_lng);

  if (nearby.length === 0) {
    logger.info('[matchAndBroadcast] No nearby drivers found', { tripId: trip.id });
    return { drivers_found: 0 };
  }

  for (const driver of nearby) {
    broadcastTripRequest(driver.driverId, trip);

    sendPushToUser(driver.userId, {
      title: 'Nuevo viaje',
      body: `Viaje solicitado de ${trip.origin_address ?? 'origen'} a ${trip.dest_address ?? 'destino'} — $${trip.total_fare ?? 'N/A'}`,
      data: { trip_id: trip.id, type: 'trip:request' },
    });
  }

  logger.info('[matchAndBroadcast] Broadcast sent', {
    tripId: trip.id,
    driversFound: nearby.length,
  });

  return { drivers_found: nearby.length };
}
