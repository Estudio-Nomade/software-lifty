import { and, eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { getDriverId } from '../../shared/db/queries';
import { drivers, ratings, tripEvents, trips } from '../../shared/db/schema';
import { AppError, ConflictError, NotFoundError } from '../../shared/lib/errors';
import type { AuthUser } from '../../shared/middleware/auth';

export const ratingsService = {
  async rateTrip(
    user: AuthUser,
    tripId: string,
    body: { rating: number; tags?: string; comment?: string },
  ) {
    if (body.rating < 1 || body.rating > 5) {
      throw new AppError('Score must be between 1 and 5', 400, 'BAD_REQUEST');
    }

    const driverId = await getDriverId(user);

    return db.transaction(async (tx) => {
      const [trip] = await tx
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.driver_id, driverId)))
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

      await tx
        .update(trips)
        .set({ status: 'rated', updated_at: new Date() })
        .where(eq(trips.id, tripId));

      await tx.insert(tripEvents).values({
        trip_id: tripId,
        from_status: 'completed',
        to_status: 'rated',
      });

      if (!trip.passenger_id) {
        return { rating_id: null, message: 'Trip completed (no passenger to rate)' };
      }

      const [rating] = await tx
        .insert(ratings)
        .values({
          trip_id: tripId,
          rater_id: user.id,
          ratee_id: trip.passenger_id,
          score: body.rating,
          tags: body.tags ?? null,
          comment: body.comment ?? null,
        })
        .returning({ id: ratings.id });

      const [rateeDriver] = await tx
        .select({ id: drivers.id })
        .from(drivers)
        .where(eq(drivers.user_id, trip.passenger_id))
        .limit(1);

      if (rateeDriver) {
        const allRatings = await tx
          .select({ score: ratings.score })
          .from(ratings)
          .where(eq(ratings.ratee_id, trip.passenger_id));
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
          .where(eq(drivers.id, rateeDriver.id));
      }

      return { rating_id: rating.id, message: 'Rating submitted' };
    });
  },
};
