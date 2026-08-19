import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { getDriverId } from '../../shared/db/queries';
import {
  cancelationLog,
  driverFeePayouts,
  driverTvfMetrics,
  drivers,
  platformConfig,
  tripEvents,
  trips,
  userDebt,
} from '../../shared/db/schema';
import { getCommissionRate, getDebtCapArs } from '../../shared/lib/commission';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import type { AuthUser } from '../../shared/middleware/auth';
import { hasActiveBlock } from './blocks';
import { DEFAULT_CANCELLATION_CONFIG, parseCancellationConfig } from './config';
import { evaluateCancel } from './evaluate';
import { getPaymentGateway } from './gateway';
import {
  applyDriverTvfActions,
  applyPassengerRateActions,
  recalcDriverTvf,
  recalcPassengerMetrics,
} from './metrics';
import {
  CANCEL_COPY,
  broadcastDriverCancelled,
  broadcastToPassengerChannel,
  notifyDebt,
  notifyDriverCancelled,
  notifyFeeApplied,
  notifyNoShow,
  notifyPassengerCancelled,
} from './notifications';
import type { CancelDecision, CancelReason, CancellationConfig } from './types';

let cachedConfig: { value: CancellationConfig; at: number } | null = null;

export async function getCancellationConfig(): Promise<CancellationConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedConfig.at < 30_000) return cachedConfig.value;
  const rows = await db
    .select({ key: platformConfig.key, value: platformConfig.value })
    .from(platformConfig)
    .where(sql`${platformConfig.key} like 'cancel.%'`);
  const value = parseCancellationConfig(rows);
  cachedConfig = { value, at: now };
  return value;
}

export function resetCancellationConfigCache() {
  cachedConfig = null;
}

function httpFor(code: CancelDecision['code']): number {
  if (code === 'CANCEL_NOT_ALLOWED' || code === 'FEE_ALREADY_APPLIED') return 409;
  if (
    code === 'DEBT_BLOCKED' ||
    code === 'PASSENGER_SUSPENDED' ||
    code === 'PASSENGER_UNDER_REVIEW'
  ) {
    return 403;
  }
  return 400;
}

async function applyFee(
  tx: typeof db,
  params: {
    passengerId: string;
    driverId: string | null;
    tripId: string;
    feeArs: number;
    phase: 1 | 2;
  },
) {
  if (params.feeArs <= 0) return;
  const charged =
    params.phase === 2
      ? await getPaymentGateway().chargeFee(params.passengerId, params.feeArs, params.tripId)
      : false;

  if (charged && params.driverId) {
    await tx.insert(driverFeePayouts).values({
      trip_id: params.tripId,
      driver_id: params.driverId,
      amount_ars: params.feeArs,
      status: 'ready',
      collection_phase: 2,
    });
    return;
  }

  const [existing] = await tx
    .select()
    .from(userDebt)
    .where(eq(userDebt.user_id, params.passengerId))
    .limit(1);
  const prev = existing?.amount_ars ?? 0;
  const next = prev + params.feeArs;
  const status = next >= 3000 ? 'blocked' : 'pending';

  if (existing) {
    await tx
      .update(userDebt)
      .set({ amount_ars: next, status, updated_at: new Date() })
      .where(eq(userDebt.user_id, params.passengerId));
  } else {
    await tx.insert(userDebt).values({
      user_id: params.passengerId,
      amount_ars: next,
      status,
    });
  }

  if (params.driverId) {
    await tx.insert(driverFeePayouts).values({
      trip_id: params.tripId,
      driver_id: params.driverId,
      amount_ars: params.feeArs,
      status: 'pending',
      collection_phase: params.phase,
    });
  }

  if (prev < 2500 && next >= 2500) {
    notifyDebt(params.passengerId, next, next >= 3000);
  } else if (next >= 3000) {
    notifyDebt(params.passengerId, next, true);
  }
}

async function applyCancel(params: {
  trip: typeof trips.$inferSelect;
  actor: 'passenger' | 'driver' | 'system';
  reason: CancelReason;
  passengerUserId: string;
  tx?: typeof db;
}) {
  const config = await getCancellationConfig();
  const decision = evaluateCancel({
    status: params.trip.status,
    actor: params.actor,
    reason: params.reason,
    now: new Date(),
    createdAt: params.trip.created_at,
    assignedAt: params.trip.assigned_at,
    waitingSince: params.trip.waiting_since,
    config,
  });

  if (!decision.canCancel) {
    throw new AppError(
      decision.code === 'NO_SHOW_TOO_EARLY'
        ? 'Debes esperar 5 minutos antes de cancelar por no-show'
        : `Cannot cancel trip in status: ${params.trip.status}`,
      httpFor(decision.code),
      decision.code ?? 'CANCEL_NOT_ALLOWED',
    );
  }

  const run = async (tx: typeof db) => {
    await tx
      .update(trips)
      .set({ status: 'cancelled', updated_at: new Date() })
      .where(eq(trips.id, params.trip.id));

    await tx.insert(tripEvents).values({
      trip_id: params.trip.id,
      from_status: params.trip.status,
      to_status: 'cancelled',
    });

    let log: typeof cancelationLog.$inferSelect;
    try {
      [log] = await tx
        .insert(cancelationLog)
        .values({
          trip_id: params.trip.id,
          user_id: params.passengerUserId,
          driver_id: params.trip.driver_id,
          stage: decision.stage,
          reason: decision.reason,
          actor: params.actor,
          fee_applied: decision.feeArs,
          credit_driver: decision.creditDriver,
          counts_for_tvf: decision.countsForTvf,
          collection_phase: config.collectionPhase,
          cancelation_time: new Date(),
        })
        .returning();
    } catch {
      throw new AppError('Fee already applied for this trip', 409, 'FEE_ALREADY_APPLIED');
    }

    if (decision.feeArs > 0 && params.trip.passenger_id) {
      await applyFee(tx, {
        passengerId: params.trip.passenger_id,
        driverId: params.trip.driver_id,
        tripId: params.trip.id,
        feeArs: decision.feeArs,
        phase: config.collectionPhase,
      });
    }

    const [updated] = await tx.select().from(trips).where(eq(trips.id, params.trip.id));
    return { updated, decision, config, log };
  };

  const result = params.tx ? await run(params.tx) : await db.transaction((tx) => run(tx));

  if (params.actor === 'passenger') {
    const snapshot = await recalcPassengerMetrics(params.passengerUserId, result.config);
    await applyPassengerRateActions(params.passengerUserId, snapshot, result.config);
  }
  if (params.trip.driver_id) {
    const snapshot = await recalcDriverTvf(params.trip.driver_id, result.config);
    await applyDriverTvfActions(params.trip.driver_id, snapshot, result.config);
  }

  return result;
}

export function enrichTripWithCancel(
  trip: typeof trips.$inferSelect | null | undefined,
  log?: typeof cancelationLog.$inferSelect | null,
) {
  if (!trip || !log) return trip;
  return {
    ...trip,
    cancel_reason: log.reason,
    cancel_actor: log.actor,
    counts_for_tvf: log.counts_for_tvf,
    credit_driver: log.credit_driver,
    fee_applied: log.fee_applied,
  };
}

export const cancellationService = {
  async previewForPassenger(user: AuthUser, tripId: string) {
    const [trip] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.passenger_id, user.id)))
      .limit(1);
    if (!trip) throw new NotFoundError('Trip not found');
    const config = await getCancellationConfig();
    const decision = evaluateCancel({
      status: trip.status,
      actor: 'passenger',
      reason: 'user_cancel',
      now: new Date(),
      createdAt: trip.created_at,
      assignedAt: trip.assigned_at,
      waitingSince: trip.waiting_since,
      config,
    });
    return {
      can_cancel: decision.canCancel,
      fee_ars: decision.feeArs,
      collection_phase: config.collectionPhase,
      copy: CANCEL_COPY[decision.copyKey ?? 'free'],
    };
  },

  async getPassengerDebt(userId: string) {
    const [row] = await db.select().from(userDebt).where(eq(userDebt.user_id, userId)).limit(1);
    return { amount_ars: row?.amount_ars ?? 0, status: row?.status ?? 'paid' };
  },

  async assertPassengerCanRequest(userId: string) {
    const debt = await this.getPassengerDebt(userId);
    const config = await getCancellationConfig();
    if (debt.amount_ars >= config.debtBlockArs) {
      throw new AppError(
        `Tienes $${debt.amount_ars} de deuda. No puedes solicitar viajes hasta regularizar tu saldo. Contacta a soporte.`,
        403,
        'DEBT_BLOCKED',
      );
    }
    if (await hasActiveBlock('passenger', userId, 'cancel_rate_72h')) {
      throw new AppError(
        'Estás suspendido temporalmente por cancelaciones.',
        403,
        'PASSENGER_SUSPENDED',
      );
    }
    if (await hasActiveBlock('passenger', userId, 'cancel_rate_review')) {
      throw new AppError(
        'Tu cuenta está en revisión. Contacta a soporte.',
        403,
        'PASSENGER_UNDER_REVIEW',
      );
    }
    return {
      debtArs: debt.amount_ars,
      warning: debt.amount_ars >= config.debtWarnArs && debt.amount_ars < config.debtBlockArs,
    };
  },

  async cancelByPassenger(user: AuthUser, tripId: string) {
    const [trip] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.passenger_id, user.id)))
      .limit(1);
    if (!trip) throw new NotFoundError('Trip not found');

    const { updated, decision, log } = await applyCancel({
      trip,
      actor: 'passenger',
      reason: 'user_cancel',
      passengerUserId: user.id,
    });

    const enriched = enrichTripWithCancel(updated, log);
    if (trip.driver_id) {
      const [driver] = await db
        .select({ userId: drivers.user_id })
        .from(drivers)
        .where(eq(drivers.id, trip.driver_id))
        .limit(1);
      if (driver?.userId) notifyPassengerCancelled(driver.userId, tripId, log);
      if (enriched) broadcastDriverCancelled(trip.driver_id, enriched);
    }
    if (updated) broadcastToPassengerChannel(user.id, updated);
    if (decision.feeArs > 0) notifyFeeApplied(user.id, tripId);
    return updated;
  },

  async cancelByDriver(user: AuthUser, tripId: string, reason: 'driver_cancel' | 'no_show') {
    const driverId = await getDriverId(user);
    const [trip] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.driver_id, driverId)))
      .limit(1);
    if (!trip) throw new NotFoundError('Trip not found');

    const { updated, decision, log } = await applyCancel({
      trip,
      actor: 'driver',
      reason,
      passengerUserId: trip.passenger_id ?? user.id,
    });

    const enriched = enrichTripWithCancel(updated, log);
    if (updated && trip.passenger_id) {
      broadcastToPassengerChannel(trip.passenger_id, updated);
      if (decision.reason === 'no_show') notifyNoShow(trip.passenger_id, tripId);
      else notifyDriverCancelled(trip.passenger_id, tripId);
    }
    return enriched;
  },

  async expireSearchTimeouts() {
    const config = await getCancellationConfig();
    const cutoff = new Date(Date.now() - config.searchTimeoutS * 1000);
    const stale = await db
      .select()
      .from(trips)
      .where(and(inArray(trips.status, ['pending', 'offered']), lte(trips.created_at, cutoff)));

    let count = 0;
    for (const trip of stale) {
      if (!trip.passenger_id) continue;
      try {
        await applyCancel({
          trip,
          actor: 'system',
          reason: 'auto_timeout',
          passengerUserId: trip.passenger_id,
        });
        if (trip.passenger_id) {
          const [fresh] = await db.select().from(trips).where(eq(trips.id, trip.id)).limit(1);
          if (fresh) broadcastToPassengerChannel(trip.passenger_id, fresh);
        }
        count += 1;
      } catch {
        // already cancelled or raced
      }
    }
    return count;
  },

  async attachDebtOnCollect(tx: typeof db, passengerId: string, totalFare: number | null) {
    const [row] = await tx
      .select()
      .from(userDebt)
      .where(eq(userDebt.user_id, passengerId))
      .limit(1);
    const debt = row?.amount_ars ?? 0;
    if (debt <= 0) return { debt_applied_ars: 0, total_due_ars: totalFare ?? 0 };
    await tx
      .update(userDebt)
      .set({ amount_ars: 0, status: 'paid', updated_at: new Date() })
      .where(eq(userDebt.user_id, passengerId));
    return { debt_applied_ars: debt, total_due_ars: (totalFare ?? 0) + debt };
  },

  async clearDebt(userId: string) {
    await db
      .insert(userDebt)
      .values({ user_id: userId, amount_ars: 0, status: 'paid' })
      .onConflictDoUpdate({
        target: userDebt.user_id,
        set: { amount_ars: 0, status: 'paid', updated_at: new Date() },
      });
  },

  async markPayoutPaid(payoutId: string) {
    const [row] = await db
      .update(driverFeePayouts)
      .set({ status: 'paid', paid_at: new Date() })
      .where(eq(driverFeePayouts.id, payoutId))
      .returning();
    if (!row) throw new NotFoundError('Payout not found');
    return row;
  },

  async getDriverCancellationMetrics(user: AuthUser) {
    const driverId = await getDriverId(user);
    const config = await getCancellationConfig();
    const commissionRate = await getCommissionRate(db);
    const debtCapArs = await getDebtCapArs(db);

    const [driver] = await db
      .select({ platform_debt: drivers.platform_debt })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    let [snapshot] = await db
      .select()
      .from(driverTvfMetrics)
      .where(eq(driverTvfMetrics.driver_id, driverId))
      .limit(1);
    if (!snapshot) {
      await recalcDriverTvf(driverId, config);
      [snapshot] = await db
        .select()
        .from(driverTvfMetrics)
        .where(eq(driverTvfMetrics.driver_id, driverId))
        .limit(1);
    }

    const [cancelAgg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        driver_cancels: sql<number>`count(*) filter (where ${cancelationLog.reason} = 'driver_cancel')::int`,
        no_shows: sql<number>`count(*) filter (where ${cancelationLog.reason} = 'no_show')::int`,
      })
      .from(cancelationLog)
      .where(eq(cancelationLog.driver_id, driverId));

    const [payoutAgg] = await db
      .select({
        pending: sql<number>`coalesce(sum(${driverFeePayouts.amount_ars}) filter (where ${driverFeePayouts.status} in ('pending','ready')), 0)::int`,
        paid: sql<number>`coalesce(sum(${driverFeePayouts.amount_ars}) filter (where ${driverFeePayouts.status} = 'paid'), 0)::int`,
      })
      .from(driverFeePayouts)
      .where(eq(driverFeePayouts.driver_id, driverId));

    const tvfRateBp = snapshot?.tvf_rate_bp ?? 10000;
    const debt = Number(driver?.platform_debt ?? 0);

    return {
      tvf_rate_pct: Math.round(tvfRateBp / 10) / 10,
      tvf_completed: snapshot?.total_completed ?? 0,
      tvf_cancels: snapshot?.total_tvf_cancels ?? 0,
      period_days: config.tvfWindowDays,
      total_cancels: cancelAgg?.total ?? 0,
      driver_cancels: cancelAgg?.driver_cancels ?? 0,
      no_shows: cancelAgg?.no_shows ?? 0,
      payouts_pending_ars: payoutAgg?.pending ?? 0,
      payouts_paid_ars: payoutAgg?.paid ?? 0,
      platform_debt: debt,
      debt_cap_ars: debtCapArs,
      debt_remaining_ars: Math.max(0, debtCapArs - debt),
      commission_active: commissionRate > 0,
    };
  },

  async putConfig(key: string, value: string) {
    if (!key.startsWith('cancel.')) {
      throw new AppError('Only cancel.* keys are allowed', 400, 'BAD_REQUEST');
    }
    await db
      .insert(platformConfig)
      .values({ key, value })
      .onConflictDoUpdate({
        target: platformConfig.key,
        set: { value, updated_at: new Date() },
      });
    resetCancellationConfigCache();
    return getCancellationConfig();
  },
};
