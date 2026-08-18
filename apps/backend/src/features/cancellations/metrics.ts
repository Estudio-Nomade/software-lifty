import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import {
  cancelationLog,
  driverTvfMetrics,
  trips,
  userCancelationMetrics,
} from '../../shared/db/schema';
import { drivers } from '../../shared/db/schema';
import { hasActiveBlock, insertBlock } from './blocks';
import { notifyCancelRateWarning, notifyTvfWarning } from './notifications';
import type { CancellationConfig } from './types';

const COMPLETED = ['completed', 'rated'];

function windowStart(days: number, now: Date) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function recalcPassengerMetrics(
  userId: string,
  config: CancellationConfig,
  now = new Date(),
) {
  const from = windowStart(config.passengerWindowDays, now);
  const [requested] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trips)
    .where(and(eq(trips.passenger_id, userId), gte(trips.created_at, from)));

  const [cancels] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pre: sql<number>`count(*) filter (where ${cancelationLog.stage} = 'pre_asignacion')::int`,
    })
    .from(cancelationLog)
    .where(
      and(
        eq(cancelationLog.user_id, userId),
        eq(cancelationLog.actor, 'passenger'),
        eq(cancelationLog.reason, 'user_cancel'),
        gte(cancelationLog.cancelation_time, from),
      ),
    );

  const totalRequested = requested?.n ?? 0;
  const totalCancels = cancels?.total ?? 0;
  const preAssign = cancels?.pre ?? 0;
  const rateBp = totalRequested === 0 ? 0 : Math.round((totalCancels * 10000) / totalRequested);

  await db
    .insert(userCancelationMetrics)
    .values({
      user_id: userId,
      period_days: config.passengerWindowDays,
      total_trips_requested: totalRequested,
      total_cancelations: totalCancels,
      pre_assign_cancelations: preAssign,
      cancelation_rate_bp: rateBp,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: userCancelationMetrics.user_id,
      set: {
        period_days: config.passengerWindowDays,
        total_trips_requested: totalRequested,
        total_cancelations: totalCancels,
        pre_assign_cancelations: preAssign,
        cancelation_rate_bp: rateBp,
        updated_at: now,
      },
    });

  return { rateBp, requested: totalRequested, cancels: totalCancels, preAssign };
}

export async function applyPassengerRateActions(
  userId: string,
  snapshot: { rateBp: number; requested: number },
  config: CancellationConfig,
  now = new Date(),
) {
  if (snapshot.requested < config.passengerMinTrips) return;
  if (snapshot.rateBp > config.passengerWarnBp) {
    notifyCancelRateWarning(userId);
  }
  if (snapshot.rateBp > config.passengerSuspendBp) {
    const active = await hasActiveBlock('passenger', userId, 'cancel_rate_72h', now);
    if (!active) {
      await insertBlock({
        subjectType: 'passenger',
        subjectId: userId,
        kind: 'cancel_rate_72h',
        startsAt: now,
        endsAt: new Date(now.getTime() + config.suspendHours * 60 * 60 * 1000),
      });
    }
  }
  if (snapshot.rateBp > config.passengerReviewBp) {
    const active = await hasActiveBlock('passenger', userId, 'cancel_rate_review', now);
    if (!active) {
      await insertBlock({
        subjectType: 'passenger',
        subjectId: userId,
        kind: 'cancel_rate_review',
        startsAt: now,
        endsAt: null,
      });
    }
  }
}

export async function recalcDriverTvf(
  driverId: string,
  config: CancellationConfig,
  now = new Date(),
) {
  const from = windowStart(config.tvfWindowDays, now);
  const [completedRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trips)
    .where(
      and(
        eq(trips.driver_id, driverId),
        inArray(trips.status, COMPLETED),
        gte(trips.updated_at, from),
      ),
    );

  const [tvfCancels] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cancelationLog)
    .where(
      and(
        eq(cancelationLog.driver_id, driverId),
        eq(cancelationLog.counts_for_tvf, true),
        gte(cancelationLog.cancelation_time, from),
      ),
    );

  const [legacyEarly] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trips)
    .where(
      and(
        eq(trips.driver_id, driverId),
        eq(trips.status, 'cancelled_early'),
        gte(trips.updated_at, from),
      ),
    );

  const completed = completedRow?.n ?? 0;
  const tvfCancelCount = (tvfCancels?.n ?? 0) + (legacyEarly?.n ?? 0);
  const denom = completed + tvfCancelCount;
  const rateBp = denom === 0 ? 10000 : Math.round((completed * 10000) / denom);

  await db
    .insert(driverTvfMetrics)
    .values({
      driver_id: driverId,
      period_days: config.tvfWindowDays,
      total_completed: completed,
      total_tvf_cancels: tvfCancelCount,
      tvf_rate_bp: rateBp,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: driverTvfMetrics.driver_id,
      set: {
        period_days: config.tvfWindowDays,
        total_completed: completed,
        total_tvf_cancels: tvfCancelCount,
        tvf_rate_bp: rateBp,
        updated_at: now,
      },
    });

  return { rateBp, completed, tvfCancels: tvfCancelCount };
}

export async function applyDriverTvfActions(
  driverId: string,
  snapshot: { rateBp: number; completed: number; tvfCancels: number },
  config: CancellationConfig,
  now = new Date(),
) {
  const denom = snapshot.completed + snapshot.tvfCancels;
  if (denom === 0) return;
  if (snapshot.rateBp < config.tvfWarnBp) {
    const [driver] = await db
      .select({ userId: drivers.user_id })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    if (driver?.userId) notifyTvfWarning(driver.userId);
  }
  if (snapshot.rateBp < config.tvfBlockBp) {
    const active = await hasActiveBlock('driver', driverId, 'tvf_review', now);
    if (!active) {
      await insertBlock({
        subjectType: 'driver',
        subjectId: driverId,
        kind: 'tvf_review',
        startsAt: now,
        endsAt: null,
      });
    }
  }
}

export async function getPassengerVisibility(
  userId: string,
  config: CancellationConfig,
  now = new Date(),
) {
  const snapshot = await recalcPassengerMetrics(userId, config, now);
  if (snapshot.cancels < config.visibilityMinCancels) {
    return { visible: false, ratePct: null as number | null, count: null as number | null };
  }
  return {
    visible: true,
    ratePct: Math.round(snapshot.rateBp / 10) / 10,
    count: snapshot.cancels,
  };
}
