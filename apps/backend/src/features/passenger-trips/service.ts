import { and, desc, eq, getTableColumns, inArray, not, or, sql } from 'drizzle-orm';
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
import { AppError, ConflictError, NotFoundError } from '../../shared/lib/errors';
import { calculateFare } from '../../shared/lib/fuel-pricing';
import { geocode, resolveRouteDistance } from '../../shared/lib/geo';
import { logger } from '../../shared/lib/logger';
import { sendPushToUser } from '../../shared/lib/push';
import type { AuthUser } from '../../shared/middleware/auth';
import { cancellationService } from '../cancellations/service';
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
    const gate = await cancellationService.assertPassengerCanRequest(user.id);
    const commissionRate = await getCommissionRate(getDb());

    // Server-side route resolution: never trust the client-provided distance,
    // recompute from origin/destination and keep the maximum.
    const resolved = await resolveRouteDistance(
      data.distance_km,
      data.duration_minutes,
      data.origin_lat,
      data.origin_lng,
      data.dest_lat,
      data.dest_lng,
    );

    const fare = await calculateFare({
      vehicle_type: data.vehicle_type,
      distance_km: resolved.distance_km,
      duration_minutes: resolved.duration_minutes,
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
        distance_km: resolved.distance_km,
        duration_minutes: resolved.duration_minutes,
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
      matchAndBroadcast({
        id: trip.id,
        passenger_id: trip.passenger_id,
        origin_address: trip.origin_address,
        dest_address: trip.dest_address,
        total_fare: trip.total_fare,
        origin_lat: trip.origin_lat,
        origin_lng: trip.origin_lng,
        dest_lat: trip.dest_lat,
        dest_lng: trip.dest_lng,
        distance_km: trip.distance_km,
        duration_minutes: trip.duration_minutes,
      })
        .then((result) => {
          if (result.drivers_found === 0 && trip.passenger_id) {
            broadcastPassengerNoDrivers(trip.passenger_id, trip);
          }
        })
        .catch((err) =>
          logger.error('[requestTrip] broadcast failed', { error: (err as Error).message }),
        );
    });

    return gate.warning ? { ...trip, debt_warning: true, debt_ars: gate.debtArs } : trip;
  },

  async retryTrip(user: AuthUser, tripId: string) {
    const [trip] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.passenger_id, user.id)))
      .limit(1);

    if (!trip) throw new NotFoundError('Trip not found');
    if (trip.status !== 'pending' && trip.status !== 'expired') {
      throw new AppError(
        `Trip is not retryable, current status: ${trip.status}`,
        400,
        'BAD_REQUEST',
      );
    }

    if (trip.status === 'expired') {
      await db
        .update(trips)
        .set({ status: 'pending', driver_id: null, expires_at: null, updated_at: new Date() })
        .where(eq(trips.id, tripId));
      await recordEvent(tripId, 'expired', 'pending');
    }

    const result = await matchAndBroadcast({
      id: trip.id,
      passenger_id: trip.passenger_id,
      origin_address: trip.origin_address,
      dest_address: trip.dest_address,
      total_fare: trip.total_fare,
      origin_lat: trip.origin_lat,
      origin_lng: trip.origin_lng,
      dest_lat: trip.dest_lat,
      dest_lng: trip.dest_lng,
      distance_km: trip.distance_km,
      duration_minutes: trip.duration_minutes,
    });

    const [updated] = await db.select().from(trips).where(eq(trips.id, tripId));
    if (result.drivers_found === 0 && trip.passenger_id) {
      broadcastPassengerNoDrivers(trip.passenger_id, updated);
    }
    return { drivers_found: result.drivers_found, trip: updated };
  },

  async releaseAndRematch(tripId: string, excludedDriverId: string) {
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) return { drivers_found: 0, trip: null };

    if (!trip.passenger_id) return { drivers_found: 0, trip };

    const rematchable = ['offered', 'expired', 'rejected'].includes(trip.status);
    if (!rematchable || trip.driver_id !== excludedDriverId) {
      return { drivers_found: 0, trip };
    }

    await db
      .update(trips)
      .set({ driver_id: null, status: 'pending', expires_at: null, updated_at: new Date() })
      .where(
        and(
          eq(trips.id, tripId),
          eq(trips.driver_id, excludedDriverId),
          inArray(trips.status, ['offered', 'expired', 'rejected']),
        ),
      );

    await recordEvent(tripId, trip.status, 'pending');

    const [reopened] = await db.select().from(trips).where(eq(trips.id, tripId));

    const result = await matchAndBroadcast(
      {
        id: reopened.id,
        passenger_id: reopened.passenger_id,
        origin_address: reopened.origin_address,
        dest_address: reopened.dest_address,
        total_fare: reopened.total_fare,
        origin_lat: reopened.origin_lat,
        origin_lng: reopened.origin_lng,
        dest_lat: reopened.dest_lat,
        dest_lng: reopened.dest_lng,
        distance_km: reopened.distance_km,
        duration_minutes: reopened.duration_minutes,
      },
      { excludeDriverIds: [excludedDriverId] },
    );

    if (result.drivers_found === 0 && reopened.passenger_id) {
      broadcastPassengerNoDrivers(reopened.passenger_id, reopened);
    }

    const [updated] = await db.select().from(trips).where(eq(trips.id, tripId));
    return { drivers_found: result.drivers_found, trip: updated };
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
      .where(
        and(
          eq(trips.passenger_id, user.id),
          or(
            not(inArray(trips.status, TERMINAL_STATUSES)),
            and(eq(trips.status, 'completed'), eq(trips.is_collected, false)),
          ),
        ),
      )
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
    return cancellationService.cancelByPassenger(user, tripId);
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

  async rateTrip(
    user: AuthUser,
    tripId: string,
    body: { rating: number; tags?: string; comment?: string },
  ) {
    if (body.rating < 1 || body.rating > 5) {
      throw new AppError('Score must be between 1 and 5', 400, 'BAD_REQUEST');
    }

    return db.transaction(async (tx) => {
      const [trip] = await tx
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.passenger_id, user.id)))
        .for('update')
        .limit(1);

      if (!trip) throw new NotFoundError('Trip not found');

      const [existing] = await tx
        .select({ id: ratings.id })
        .from(ratings)
        .where(and(eq(ratings.trip_id, tripId), eq(ratings.rater_id, user.id)))
        .for('update')
        .limit(1);

      if (existing) throw new ConflictError('Rating already exists for this trip');

      if (trip.status !== 'completed') {
        throw new AppError('Trip is not in completed status', 400, 'BAD_REQUEST');
      }

      if (!trip.driver_id) {
        throw new AppError('Trip has no assigned driver', 400, 'BAD_REQUEST');
      }

      const [driver] = await tx
        .select({ id: drivers.id, user_id: drivers.user_id })
        .from(drivers)
        .where(eq(drivers.id, trip.driver_id))
        .limit(1);

      if (!driver) throw new NotFoundError('Driver not found');

      await tx
        .update(trips)
        .set({ status: 'rated', updated_at: new Date() })
        .where(eq(trips.id, tripId));

      await tx.insert(tripEvents).values({
        trip_id: tripId,
        from_status: 'completed',
        to_status: 'rated',
      });

      const [rating] = await tx
        .insert(ratings)
        .values({
          trip_id: tripId,
          rater_id: user.id,
          ratee_id: driver.user_id,
          score: body.rating,
          tags: body.tags ?? null,
          comment: body.comment ?? null,
        })
        .returning({ id: ratings.id });

      const allRatings = await tx
        .select({ score: ratings.score })
        .from(ratings)
        .where(eq(ratings.ratee_id, driver.user_id));

      const avg =
        allRatings.length > 0
          ? allRatings.reduce((sum, r) => sum + r.score, 0) / allRatings.length
          : 0;

      await tx
        .update(drivers)
        .set({
          rating_avg: Math.round(avg * 100) / 100,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, driver.id));

      return { rating_id: rating.id, message: 'Rating submitted' };
    });
  },
};

export function broadcastToPassenger(
  passengerId: string,
  trip: any,
  extra?: Record<string, unknown>,
) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    logger.warn('[BROADCAST] Missing config for passenger broadcast');
    return;
  }
  const topic = `passenger:${passengerId}`;
  logger.info('[BROADCAST] Sending to', topic, 'tripId:', trip?.id ?? trip?.trip_id);
  fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [{ topic, event: 'trip:status', payload: { ...trip, ...(extra ?? {}) } }],
    }),
  })
    .then((res) => logger.info('[BROADCAST] Passenger broadcast response:', res.status))
    .catch((err) => logger.error('[BROADCAST] Passenger broadcast error:', (err as Error).message));
}

export function broadcastPassengerNoDrivers(passengerId: string, trip: any) {
  broadcastToPassenger(passengerId, trip, { drivers_found: 0, reason: 'NO_NEARBY_DRIVERS' });
}
