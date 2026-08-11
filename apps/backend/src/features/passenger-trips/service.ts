import { and, desc, eq, getTableColumns, inArray, not, sql } from 'drizzle-orm';
import { db, getDb } from '../../shared/db/client';
import {
  driverLocations,
  drivers,
  ratings,
  tripEvents,
  trips,
  users,
  vehicles,
} from '../../shared/db/schema';
import { getCommissionRate } from '../../shared/lib/commission';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { calculateFare } from '../../shared/lib/fuel-pricing';
import { geocode } from '../../shared/lib/geo';
import { logger } from '../../shared/lib/logger';
import { sendPushToUser } from '../../shared/lib/push';
import type { AuthUser } from '../../shared/middleware/auth';
import { matchAndBroadcast } from './matching.service';

const TERMINAL_STATUSES = [
  'completed',
  'rejected',
  'expired',
  'cancelled',
  'cancelled_early',
  'cancelled_late',
  'rated',
];

async function recordEvent(tripId: string, fromStatus: string | null, toStatus: string) {
  await db.insert(tripEvents).values({
    trip_id: tripId,
    from_status: fromStatus,
    to_status: toStatus,
  });
}

export const passengerTripService = {
  async requestTrip(
    user: AuthUser,
    data: {
      origin_lat: number;
      origin_lng: number;
      dest_lat: number;
      dest_lng: number;
      origin_address?: string;
      dest_address?: string;
      pickup_instructions?: string;
      vehicle_type: string;
      distance_km: number;
      duration_minutes: number;
    },
  ) {
    const commissionRate = await getCommissionRate(getDb());

    const fare = await calculateFare({
      vehicle_type: data.vehicle_type,
      distance_km: data.distance_km,
      duration_minutes: data.duration_minutes,
      commission_rate: commissionRate,
    });

    let originAddress = data.origin_address || null;
    let destAddress = data.dest_address || null;

    try {
      const result = await geocode({ lat: data.origin_lat, lng: data.origin_lng });
      if (result.formatted_address && !result.formatted_address.startsWith('Ubicación (')) {
        originAddress = result.formatted_address;
      }
    } catch {
      logger.warn('[requestTrip] failed to geocode origin');
    }

    try {
      const result = await geocode({ lat: data.dest_lat, lng: data.dest_lng });
      if (result.formatted_address && !result.formatted_address.startsWith('Ubicación (')) {
        destAddress = result.formatted_address;
      }
    } catch {
      logger.warn('[requestTrip] failed to geocode destination');
    }

    const [trip] = await db
      .insert(trips)
      .values({
        passenger_id: user.id,
        driver_id: null,
        origin_lat: data.origin_lat,
        origin_lng: data.origin_lng,
        dest_lat: data.dest_lat,
        dest_lng: data.dest_lng,
        origin_address: originAddress,
        dest_address: destAddress,
        pickup_instructions: data.pickup_instructions ?? null,
        distance_km: data.distance_km,
        duration_minutes: data.duration_minutes,
        base_fare: fare.base_fare,
        distance_fare: fare.distance_fare,
        time_fare: fare.time_fare,
        total_fare: fare.total,
        platform_fee: fare.platform_fee,
        driver_earnings: fare.driver_earnings,
        status: 'pending',
      })
      .returning();

    await recordEvent(trip.id, null, 'pending');

    setImmediate(() => {
      matchAndBroadcast(trip).catch((err) =>
        logger.error('[requestTrip] broadcast failed', { error: (err as Error).message }),
      );
    });

    return trip;
  },

  async getActiveTrip(user: AuthUser) {
    const result = await db
      .select({
        ...getTableColumns(trips),
        driver_name: users.full_name,
        driver_avatar_url: users.avatar_url,
        driver_phone: users.phone,
        driver_rating: sql`(
          SELECT ROUND(AVG(r.score)::numeric, 1)::float
          FROM ${ratings} r
          WHERE r.ratee_id = ${users.id}
        )`,
        vehicle_brand: vehicles.brand,
        vehicle_model: vehicles.model,
        vehicle_color: vehicles.color,
        vehicle_plate: vehicles.plate,
        driver_lat: driverLocations.lat,
        driver_lng: driverLocations.lng,
      })
      .from(trips)
      .leftJoin(drivers, eq(trips.driver_id, drivers.id))
      .leftJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(vehicles, eq(drivers.id, vehicles.driver_id))
      .leftJoin(driverLocations, eq(drivers.id, driverLocations.driver_id))
      .where(and(eq(trips.passenger_id, user.id), not(inArray(trips.status, TERMINAL_STATUSES))))
      .orderBy(desc(trips.created_at))
      .limit(1);

    return result[0] ?? null;
  },

  async getTripById(user: AuthUser, tripId: string) {
    const [trip] = await db
      .select({
        ...getTableColumns(trips),
        driver_name: users.full_name,
        driver_avatar_url: users.avatar_url,
        driver_phone: users.phone,
        driver_rating: sql`(
          SELECT ROUND(AVG(r.score)::numeric, 1)::float
          FROM ${ratings} r
          WHERE r.ratee_id = ${users.id}
        )`,
        vehicle_brand: vehicles.brand,
        vehicle_model: vehicles.model,
        vehicle_color: vehicles.color,
        vehicle_plate: vehicles.plate,
        driver_lat: driverLocations.lat,
        driver_lng: driverLocations.lng,
      })
      .from(trips)
      .leftJoin(drivers, eq(trips.driver_id, drivers.id))
      .leftJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(vehicles, eq(drivers.id, vehicles.driver_id))
      .leftJoin(driverLocations, eq(drivers.id, driverLocations.driver_id))
      .where(and(eq(trips.id, tripId), eq(trips.passenger_id, user.id)))
      .limit(1);

    if (!trip) throw new NotFoundError('Trip not found');

    const events = await db
      .select()
      .from(tripEvents)
      .where(eq(tripEvents.trip_id, tripId))
      .orderBy(tripEvents.changed_at);

    return { ...trip, events };
  },

  async cancelTrip(user: AuthUser, tripId: string) {
    return db.transaction(async (tx) => {
      const [trip] = await tx
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.passenger_id, user.id)))
        .for('update')
        .limit(1);

      if (!trip) throw new NotFoundError('Trip not found');

      const allowedStatuses = ['pending', 'offered', 'accepted'];
      if (!allowedStatuses.includes(trip.status)) {
        throw new AppError(`Cannot cancel trip in status: ${trip.status}`, 400, 'BAD_REQUEST');
      }

      await tx
        .update(trips)
        .set({ status: 'cancelled', updated_at: new Date() })
        .where(eq(trips.id, tripId));

      await tx.insert(tripEvents).values({
        trip_id: tripId,
        from_status: trip.status,
        to_status: 'cancelled',
      });

      if (trip.driver_id) {
        const [driver] = await tx
          .select({ userId: drivers.user_id })
          .from(drivers)
          .where(eq(drivers.id, trip.driver_id))
          .limit(1);

        if (driver?.userId) {
          sendPushToUser(driver.userId, {
            title: 'Viaje cancelado',
            body: 'El pasajero ha cancelado el viaje.',
            data: { trip_id: tripId, type: 'trip:cancelled' },
          });
        }
      }

      const [updated] = await tx.select().from(trips).where(eq(trips.id, tripId));
      return updated;
    });
  },

  async getTripHistory(user: AuthUser, page: number, limit: number) {
    const offset = (page - 1) * limit;
    return db
      .select({
        ...getTableColumns(trips),
        driver_name: users.full_name,
        driver_avatar_url: users.avatar_url,
        driver_rating: sql`(
          SELECT ROUND(AVG(r.score)::numeric, 1)::float
          FROM ${ratings} r
          WHERE r.ratee_id = ${users.id}
        )`,
        vehicle_brand: vehicles.brand,
        vehicle_model: vehicles.model,
        vehicle_color: vehicles.color,
        vehicle_plate: vehicles.plate,
        driver_lat: driverLocations.lat,
        driver_lng: driverLocations.lng,
      })
      .from(trips)
      .leftJoin(drivers, eq(trips.driver_id, drivers.id))
      .leftJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(vehicles, eq(drivers.id, vehicles.driver_id))
      .leftJoin(driverLocations, eq(drivers.id, driverLocations.driver_id))
      .where(eq(trips.passenger_id, user.id))
      .orderBy(desc(trips.created_at))
      .limit(limit)
      .offset(offset);
  },
};

export function broadcastToPassenger(passengerId: string, trip: any) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    logger.warn('[BROADCAST] Missing config for passenger broadcast');
    return;
  }
  const topic = `passenger:${passengerId}`;
  logger.info('[BROADCAST] Sending to', topic, 'tripId:', trip.id);
  fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [{ topic, event: 'trip:status', payload: trip }],
    }),
  })
    .then((res) => logger.info('[BROADCAST] Passenger broadcast response:', res.status))
    .catch((err) => logger.error('[BROADCAST] Passenger broadcast error:', (err as Error).message));
}
