import { and, desc, eq, getTableColumns, inArray, not, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { getDriverId } from '../../shared/db/queries';
import { drivers, ratings, tripEvents, trips, users } from '../../shared/db/schema';
import { AppError, BadRequestError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { getPayment } from '../../shared/lib/mercado-pago';
import { calculateFare, calculatePlatformFee } from '../../shared/lib/pricing';
import { sendPushToUser } from '../../shared/lib/push';
import type { AuthUser } from '../../shared/middleware/auth';

const VALID_TRANSITIONS: Record<string, string[]> = {
  request_received: ['accepted', 'rejected', 'cancelled'],
  accepted: ['en_route', 'cancelled'],
  en_route: ['waiting', 'cancelled'],
  waiting: ['in_trip', 'cancelled_early', 'cancelled_late'],
  in_trip: ['completed', 'cancelled'],
  completed: ['rated'],
};

function broadcastTripRequest(driverId: string, trip: any) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    logger.warn('[BROADCAST] Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    return;
  }

  const topic = `driver:${driverId}`;
  logger.info('[BROADCAST] Sending to', topic, 'tripId:', trip.id);

  fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic,
          event: 'trip:request',
          payload: trip,
        },
      ],
    }),
  })
    .then((res) => logger.info('[BROADCAST] Response:', res.status))
    .catch((err) => logger.error('[BROADCAST] Error:', (err as Error).message));
}

const TERMINAL_STATUSES = [
  'completed',
  'rejected',
  'cancelled',
  'cancelled_early',
  'cancelled_late',
  'rated',
];

async function recordEvent(tripId: string, fromStatus: string | null, toStatus: string, tx = db) {
  await tx.insert(tripEvents).values({
    trip_id: tripId,
    from_status: fromStatus,
    to_status: toStatus,
  });
}

async function findTrip(driverId: string, tripId: string, tx = db) {
  const [trip] = await tx
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.driver_id, driverId)))
    .for('update')
    .limit(1);
  if (!trip) throw new NotFoundError('Trip not found');
  return trip;
}

async function transitionTrip(driverId: string, tripId: string, targetStatus: string) {
  return db.transaction(async (tx) => {
    const trip = await findTrip(driverId, tripId, tx);

    let actualTarget = targetStatus;

    if (targetStatus === 'cancelled' && trip.status === 'waiting') {
      const waitingSince = trip.waiting_since;
      if (!waitingSince)
        throw new AppError('Cannot cancel: waiting_since not set', 400, 'BAD_REQUEST');
      const elapsed = (Date.now() - waitingSince.getTime()) / 60000;
      const tolerance = trip.tolerance_minutes ?? 5;
      actualTarget = elapsed < tolerance ? 'cancelled_early' : 'cancelled_late';
    }

    const allowed = VALID_TRANSITIONS[trip.status];
    if (!allowed || !allowed.includes(actualTarget)) {
      throw new AppError(
        `Invalid transition from ${trip.status} to ${actualTarget}`,
        400,
        'BAD_REQUEST',
      );
    }

    const updateData: Record<string, any> = {
      status: actualTarget,
      updated_at: new Date(),
    };

    if (actualTarget === 'waiting') {
      updateData.waiting_since = new Date();
    }

    if (actualTarget === 'cancelled_late') {
      const compensationTotal = trip.base_fare ?? 0;
      const compensationPlatformFee = calculatePlatformFee(compensationTotal);
      const compensationDriverEarnings = compensationTotal - compensationPlatformFee;

      updateData.total_fare = compensationTotal;
      updateData.platform_fee = compensationPlatformFee;
      updateData.driver_earnings = compensationDriverEarnings;

      await tx
        .update(drivers)
        .set({
          platform_debt: sql`${drivers.platform_debt} + ${compensationPlatformFee}`,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, trip.driver_id));
    }

    await tx.update(trips).set(updateData).where(eq(trips.id, tripId));
    await recordEvent(tripId, trip.status, actualTarget, tx);

    if (actualTarget === 'completed') {
      await tx
        .update(drivers)
        .set({ total_trips: sql`${drivers.total_trips} + 1` })
        .where(eq(drivers.id, driverId));
    }

    const [updated] = await tx.select().from(trips).where(eq(trips.id, tripId));
    return updated;
  });
}

export const tripService = {
  async createTrip(user: AuthUser, data: any) {
    const driverId = await getDriverId(user);

    const fare = calculateFare({
      vehicle_type: data.vehicle_type,
      distance_km: data.distance_km,
      duration_minutes: data.duration_minutes,
    });

    const [trip] = await db
      .insert(trips)
      .values({
        driver_id: driverId,
        passenger_id: data.passenger_id ?? null,
        origin_lat: data.origin_lat,
        origin_lng: data.origin_lng,
        dest_lat: data.dest_lat,
        dest_lng: data.dest_lng,
        origin_address: data.origin_address ?? null,
        dest_address: data.dest_address ?? null,
        distance_km: data.distance_km,
        duration_minutes: data.duration_minutes,
        base_fare: fare.base_fare,
        distance_fare: fare.distance_fare,
        time_fare: fare.time_fare,
        total_fare: fare.total,
        platform_fee: fare.platform_fee,
        driver_earnings: fare.driver_earnings,
        status: 'request_received',
      })
      .returning();

    await recordEvent(trip.id, null, 'request_received');

    broadcastTripRequest(driverId, trip);

    sendPushToUser(user.id, {
      title: 'Nuevo viaje',
      body: `Viaje solicitado de ${data.origin_address ?? 'origen'} a ${data.dest_address ?? 'destino'} — $${fare.total}`,
      data: { trip_id: trip.id, type: 'trip:request' },
    });

    return trip;
  },

  async acceptTrip(user: AuthUser, tripId: string) {
    const driverId = await getDriverId(user);
    const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();

    return db.transaction(async (tx) => {
      const trip = await findTrip(driverId, tripId, tx);

      const allowed = VALID_TRANSITIONS[trip.status];
      if (!allowed || !allowed.includes('accepted')) {
        throw new AppError(
          `Invalid transition from ${trip.status} to accepted`,
          400,
          'BAD_REQUEST',
        );
      }

      await tx
        .update(trips)
        .set({
          status: 'accepted',
          verification_code: verificationCode,
          updated_at: new Date(),
        })
        .where(eq(trips.id, tripId));

      await recordEvent(tripId, trip.status, 'accepted', tx);

      const [updated] = await tx.select().from(trips).where(eq(trips.id, tripId));

      if (trip.passenger_id) {
        sendPushToUser(trip.passenger_id, {
          title: 'Tu conductor aceptó el viaje',
          body: `Código de verificación: ${verificationCode}`,
          data: { type: 'trip:verification', trip_id: tripId, verification_code: verificationCode },
        });
      }

      return updated;
    });
  },

  async rejectTrip(user: AuthUser, tripId: string) {
    const driverId = await getDriverId(user);
    return transitionTrip(driverId, tripId, 'rejected');
  },

  async enRouteTrip(user: AuthUser, tripId: string) {
    const driverId = await getDriverId(user);
    return transitionTrip(driverId, tripId, 'en_route');
  },

  async arrivedTrip(user: AuthUser, tripId: string) {
    const driverId = await getDriverId(user);
    return transitionTrip(driverId, tripId, 'waiting');
  },

  async startTrip(user: AuthUser, tripId: string, verificationCode: string) {
    const driverId = await getDriverId(user);

    const trip = await db
      .select({ verification_code: trips.verification_code })
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.driver_id, driverId)))
      .limit(1);

    if (!trip[0]) throw new NotFoundError('Trip not found');
    if (trip[0].verification_code !== verificationCode) {
      throw new BadRequestError('El código de verificación no coincide');
    }

    return transitionTrip(driverId, tripId, 'in_trip');
  },

  async completeTrip(user: AuthUser, tripId: string) {
    const driverId = await getDriverId(user);
    const trip = await transitionTrip(driverId, tripId, 'completed');
    return trip;
  },

  async cancelTrip(user: AuthUser, tripId: string) {
    const driverId = await getDriverId(user);
    return transitionTrip(driverId, tripId, 'cancelled');
  },

  async getActiveTrip(user: AuthUser) {
    const driverId = await getDriverId(user);
    const result = await db
      .select({
        ...getTableColumns(trips),
        passenger_name: users.full_name,
        passenger_avatar_url: users.avatar_url,
        passenger_phone: users.phone,
        passenger_rating: sql<number | null>`(
          SELECT ROUND(AVG(r.score)::numeric, 1)::float
          FROM ${ratings} r
          WHERE r.ratee_id = ${trips.passenger_id}
        )`,
      })
      .from(trips)
      .leftJoin(users, eq(trips.passenger_id, users.id))
      .where(and(eq(trips.driver_id, driverId), not(inArray(trips.status, TERMINAL_STATUSES))))
      .orderBy(desc(trips.created_at))
      .limit(1);
    return result[0] ?? null;
  },

  async getTripHistory(user: AuthUser, page: number, limit: number) {
    const driverId = await getDriverId(user);
    const offset = (page - 1) * limit;
    return db
      .select()
      .from(trips)
      .where(eq(trips.driver_id, driverId))
      .orderBy(desc(trips.created_at))
      .limit(limit)
      .offset(offset);
  },

  async getTripById(user: AuthUser, tripId: string) {
    const driverId = await getDriverId(user);
    const [trip] = await db
      .select({
        ...getTableColumns(trips),
        passenger_name: users.full_name,
        passenger_avatar_url: users.avatar_url,
        passenger_phone: users.phone,
        passenger_rating: sql<number | null>`(
          SELECT ROUND(AVG(r.score)::numeric, 1)::float
          FROM ${ratings} r
          WHERE r.ratee_id = ${trips.passenger_id}
        )`,
      })
      .from(trips)
      .leftJoin(users, eq(trips.passenger_id, users.id))
      .where(and(eq(trips.id, tripId), eq(trips.driver_id, driverId)))
      .limit(1);
    if (!trip) throw new NotFoundError('Trip not found');
    return trip;
  },

  async collectTrip(
    user: AuthUser,
    tripId: string,
    paymentMethod: 'cash' | 'mercadopago',
    mpPaymentId?: string,
  ) {
    const driverId = await getDriverId(user);

    const [preCheck] = await db
      .select({ is_collected: trips.is_collected })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (preCheck?.is_collected) {
      throw new AppError('Payment already collected for this trip', 400, 'BAD_REQUEST');
    }

    if (paymentMethod === 'mercadopago' && mpPaymentId) {
      const paymentInfo = await getPayment(mpPaymentId);

      if (paymentInfo.status !== 'approved') {
        throw new AppError(`Payment not approved: ${paymentInfo.status}`, 400, 'BAD_REQUEST');
      }
    }

    return db.transaction(async (tx) => {
      const trip = await findTrip(driverId, tripId, tx);

      if (trip.status !== 'completed') {
        throw new AppError('Trip must be completed before collecting payment', 400, 'BAD_REQUEST');
      }

      if (trip.is_collected) {
        throw new AppError('Payment already collected for this trip', 400, 'BAD_REQUEST');
      }

      const [updated] = await tx
        .update(trips)
        .set({ is_collected: true, payment_method: paymentMethod, updated_at: new Date() })
        .where(eq(trips.id, tripId))
        .returning();

      if (paymentMethod === 'cash' && trip.platform_fee) {
        await tx
          .update(drivers)
          .set({
            platform_debt: sql`${drivers.platform_debt} + ${trip.platform_fee}`,
            updated_at: new Date(),
          })
          .where(eq(drivers.id, driverId));
      }

      return updated;
    });
  },
};
