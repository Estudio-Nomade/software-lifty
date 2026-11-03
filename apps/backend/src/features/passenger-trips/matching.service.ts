import { and, eq, gt, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import {
  driverLocations,
  drivers,
  tripEvents,
  trips,
  users,
  vehicles,
} from '../../shared/db/schema';
import { DRIVER_OFFLINE_GRACE_MS } from '../../shared/lib/cleanup';
import { haversineDistance } from '../../shared/lib/geo';
import { logger } from '../../shared/lib/logger';
import { sendPushToUserDetailed } from '../../shared/lib/push';
import { normalizeVehicleClass, vehicleTypesCompatible } from '../../shared/lib/vehicle-class';
import { listBlockedDriverIds } from '../cancellations/blocks';
import { getPassengerVisibility } from '../cancellations/metrics';
import { getCancellationConfig } from '../cancellations/service';
import { attachPassengerFields, broadcastTripRequest } from '../trips/service';

const OFFER_TIMEOUT_MS = 20_000;
const DEFAULT_MATCH_RADIUS_KM = 8;
const DRIVER_LOCATION_FRESHNESS_MS = 5 * 60 * 1000;

interface NearbyDriver {
  driverId: string;
  userId: string;
  distance: number;
  fullName: string;
  vehicleType: string;
}

export interface MatchOptions {
  excludeDriverIds?: string[];
  /** Canonical or alias; required for filtering. Loaded from DB if omitted on trip. */
  requestedVehicleType?: string | null;
}

export async function findNearbyDrivers(
  originLat: number,
  originLng: number,
  radiusKm = DEFAULT_MATCH_RADIUS_KM,
  excludeDriverIds: string[] = [],
  requestedVehicleType?: string | null,
): Promise<NearbyDriver[]> {
  const requestedClass = normalizeVehicleClass(requestedVehicleType);
  if (!requestedClass) {
    logger.warn('[findNearbyDrivers] missing/invalid requested vehicle type — fail closed', {
      requestedVehicleType,
    });
    return [];
  }

  const conditions = [
    eq(drivers.status, 'approved'),
    sql`${driverLocations.lat} IS NOT NULL`,
    sql`${driverLocations.lng} IS NOT NULL`,
    gt(driverLocations.updated_at, new Date(Date.now() - DRIVER_LOCATION_FRESHNESS_MS)),
    // Online (explicit) OR recently seen (grace period for a backgrounded app).
    or(
      eq(drivers.is_online, true),
      gt(drivers.last_heartbeat, new Date(Date.now() - DRIVER_OFFLINE_GRACE_MS)),
    ),
  ];
  const blocked = await listBlockedDriverIds();
  const excluded = [...new Set([...excludeDriverIds, ...blocked])];
  if (excluded.length > 0) {
    conditions.push(notInArray(drivers.id, excluded));
  }

  // SQL pre-filter by class aliases (fail closed: innerJoin requires a vehicles row).
  if (requestedClass === 'moto') {
    conditions.push(sql`lower(trim(${vehicles.vehicle_type})) IN ('motorcycle', 'moto')`);
  } else {
    conditions.push(
      sql`lower(trim(${vehicles.vehicle_type})) IN ('car', 'auto', 'pickup', 'van', 'camioneta')`,
    );
  }

  const rows = await db
    .select({
      driverId: drivers.id,
      userId: users.id,
      fullName: users.full_name,
      lat: driverLocations.lat,
      lng: driverLocations.lng,
      vehicleType: vehicles.vehicle_type,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.user_id, users.id))
    .innerJoin(driverLocations, eq(drivers.id, driverLocations.driver_id))
    .innerJoin(vehicles, eq(drivers.id, vehicles.driver_id))
    .where(and(...conditions));

  return rows
    .map((d) => ({
      driverId: d.driverId,
      userId: d.userId,
      fullName: d.fullName ?? 'Conductor',
      vehicleType: d.vehicleType,
      distance: haversineDistance(originLat, originLng, d.lat!, d.lng!),
    }))
    .filter((d) => d.distance <= radiusKm && vehicleTypesCompatible(requestedClass, d.vehicleType))
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
    vehicle_type?: string | null;
  },
  options: MatchOptions = {},
) {
  let requestedType = options.requestedVehicleType ?? trip.vehicle_type ?? null;
  if (!normalizeVehicleClass(requestedType)) {
    const [row] = await db
      .select({ vehicle_type: trips.vehicle_type })
      .from(trips)
      .where(eq(trips.id, trip.id))
      .limit(1);
    requestedType = row?.vehicle_type ?? null;
  }

  const nearby = await findNearbyDrivers(
    trip.origin_lat,
    trip.origin_lng,
    DEFAULT_MATCH_RADIUS_KM,
    options.excludeDriverIds ?? [],
    requestedType,
  );

  if (nearby.length === 0) {
    logger.info('[matchAndBroadcast] No nearby drivers found', {
      tripId: trip.id,
      requestedVehicleType: requestedType,
    });
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

  let offerPayload: Record<string, unknown> = await attachPassengerFields(assigned);
  if (trip.passenger_id) {
    const config = await getCancellationConfig();
    const vis = await getPassengerVisibility(trip.passenger_id, config);
    offerPayload = {
      ...offerPayload,
      passenger_cancel_visible: vis.visible,
      passenger_cancel_rate_pct: vis.ratePct,
      passenger_cancel_count_30d: vis.count,
    };
  }

  broadcastTripRequest(driver.driverId, offerPayload);

  void sendPushToUserDetailed(driver.userId, {
    title: 'Nuevo viaje',
    body: `Viaje solicitado de ${assigned.origin_address ?? 'origen'} a ${assigned.dest_address ?? 'destino'} — $${assigned.total_fare ?? 'N/A'}`,
    channelId: 'trip-offers',
    sound: 'trip-request.wav',
    data: { trip_id: trip.id, type: 'trip:request' },
  })
    .then((result) => {
      logger.info('[OFFER-PUSH] match→driver', {
        tripId: trip.id.slice(0, 8),
        userId: driver.userId.slice(0, 8),
        tokenCount: result.tokenCount,
        push_status: result.status,
      });
    })
    .catch((err) => {
      logger.error('[OFFER-PUSH] match→driver failed', {
        tripId: trip.id.slice(0, 8),
        error: (err as Error).message,
      });
    });

  logger.info(`[MATCH] Assigned trip ${trip.id} to driver ${driver.driverId}`, {
    tripId: trip.id,
    driverId: driver.driverId,
    distanceKm: Math.round(driver.distance * 100) / 100,
    vehicleType: driver.vehicleType,
    requestedVehicleType: requestedType,
  });

  return { drivers_found: 1, driver_id: driver.driverId };
}
