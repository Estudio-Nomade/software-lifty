import { type SQL, and, count, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { drivers, trips, users } from '../../shared/db/schema';
import { getCommissionConfig } from '../../shared/lib/commission';
import { AppError, NotFoundError } from '../../shared/lib/errors';

/** Same completed set as driver earnings. */
export const COMPLETED_TRIP_STATUSES = ['completed', 'rated'] as const;

/** Live trip statuses (driver has accepted / is executing). */
export const IN_PROGRESS_TRIP_STATUSES = ['accepted', 'en_route', 'waiting', 'in_trip'] as const;

export type DashboardRange = 'today' | '7d' | '30d';

/**
 * Range bounds use UTC calendar days (same style as commission day math).
 * - today: [UTC midnight today, now]
 * - 7d / 30d: [UTC midnight (N-1) days ago, now] inclusive of today
 * Trip money/completed filters use trips.created_at.
 */
export function resolveDashboardRange(
  range: DashboardRange,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const to = now;
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const utcMidnight = (yy: number, mm: number, dd: number) =>
    new Date(Date.UTC(yy, mm, dd, 0, 0, 0, 0));

  if (range === 'today') {
    return { from: utcMidnight(y, m, d), to };
  }
  const daysBack = range === '7d' ? 6 : 29;
  const start = utcMidnight(y, m, d);
  start.setUTCDate(start.getUTCDate() - daysBack);
  return { from: start, to };
}

function num(v: unknown): number {
  return Number(v ?? 0);
}

export const adminDashboardService = {
  async getDashboardSummary(range: DashboardRange = 'today') {
    const { from, to } = resolveDashboardRange(range);
    const completedInRange = and(
      inArray(trips.status, [...COMPLETED_TRIP_STATUSES]),
      gte(trips.created_at, from),
      lte(trips.created_at, to),
    );

    const [onlineRow, approvedRow, pendingRow, completedRow, inProgressRow, moneyRow, commission] =
      await Promise.all([
        db
          .select({ n: count() })
          .from(drivers)
          .where(eq(drivers.is_online, true))
          .then((r) => r[0]),
        db
          .select({ n: count() })
          .from(drivers)
          .where(eq(drivers.status, 'approved'))
          .then((r) => r[0]),
        db
          .select({ n: count() })
          .from(drivers)
          .where(eq(drivers.status, 'review'))
          .then((r) => r[0]),
        db
          .select({ n: count() })
          .from(trips)
          .where(completedInRange)
          .then((r) => r[0]),
        db
          .select({ n: count() })
          .from(trips)
          .where(inArray(trips.status, [...IN_PROGRESS_TRIP_STATUSES]))
          .then((r) => r[0]),
        db
          .select({
            gross_fare: sum(trips.total_fare),
            platform_fee: sum(trips.platform_fee),
            driver_earnings: sum(trips.driver_earnings),
            tips: sum(trips.tip_amount),
          })
          .from(trips)
          .where(completedInRange)
          .then((r) => r[0]),
        getCommissionConfig(db),
      ]);

    const completed = num(completedRow?.n);
    const gross_fare = num(moneyRow?.gross_fare);
    const platform_fee = num(moneyRow?.platform_fee);
    const driver_earnings = num(moneyRow?.driver_earnings);
    const tips = num(moneyRow?.tips);

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      drivers: {
        online_now: num(onlineRow?.n),
        approved: num(approvedRow?.n),
        pending_review: num(pendingRow?.n),
      },
      trips: {
        completed,
        in_progress: num(inProgressRow?.n),
      },
      money: {
        currency: 'ARS' as const,
        gross_fare,
        platform_fee,
        driver_earnings,
        tips,
        avg_ticket: completed > 0 ? gross_fare / completed : null,
        take_rate: gross_fare > 0 ? platform_fee / gross_fare : null,
      },
      commission: {
        phase: commission.phase,
        currentDay: commission.currentDay,
        rate: commission.rate,
      },
    };
  },

  async listDriverTrips(
    driverId: string,
    opts?: {
      limit?: number;
      offset?: number;
      status?: string;
      from?: string;
      to?: string;
    },
  ) {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    if (!driver) throw new NotFoundError('Driver not found');

    if (opts?.from && Number.isNaN(Date.parse(opts.from))) {
      throw new AppError('from must be a valid ISO date', 400, 'BAD_REQUEST');
    }
    if (opts?.to && Number.isNaN(Date.parse(opts.to))) {
      throw new AppError('to must be a valid ISO date', 400, 'BAD_REQUEST');
    }

    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
    const offset = Math.max(opts?.offset ?? 0, 0);

    const conditions: SQL[] = [eq(trips.driver_id, driverId)];

    if (opts?.status) {
      conditions.push(eq(trips.status, opts.status));
    } else {
      conditions.push(inArray(trips.status, [...COMPLETED_TRIP_STATUSES]));
    }

    if (opts?.from) {
      conditions.push(gte(trips.created_at, sql`${opts.from}::timestamptz`));
    }
    if (opts?.to) {
      conditions.push(lte(trips.created_at, sql`${opts.to}::timestamptz`));
    }

    const whereClause = and(...conditions);

    const [rows, countRow, totalsRow] = await Promise.all([
      db
        .select({
          id: trips.id,
          status: trips.status,
          created_at: trips.created_at,
          origin_address: trips.origin_address,
          dest_address: trips.dest_address,
          distance_km: trips.distance_km,
          duration_minutes: trips.duration_minutes,
          total_fare: trips.total_fare,
          platform_fee: trips.platform_fee,
          driver_earnings: trips.driver_earnings,
          tip_amount: trips.tip_amount,
          payment_method: trips.payment_method,
          is_collected: trips.is_collected,
          passenger_name: users.full_name,
        })
        .from(trips)
        .leftJoin(users, eq(trips.passenger_id, users.id))
        .where(whereClause)
        .orderBy(desc(trips.created_at))
        .limit(limit)
        .offset(offset),
      db
        .select({ n: count() })
        .from(trips)
        .where(whereClause)
        .then((r) => r[0]),
      db
        .select({
          trip_count: count(),
          gross_fare: sum(trips.total_fare),
          platform_fee: sum(trips.platform_fee),
          driver_earnings: sum(trips.driver_earnings),
        })
        .from(trips)
        .where(whereClause)
        .then((r) => r[0]),
    ]);

    const total = num(countRow?.n);

    return {
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        created_at: r.created_at?.toISOString() ?? '',
        origin_address: r.origin_address ?? null,
        dest_address: r.dest_address ?? null,
        distance_km: r.distance_km != null ? Number(r.distance_km) : null,
        duration_minutes: r.duration_minutes != null ? Number(r.duration_minutes) : null,
        total_fare: num(r.total_fare),
        platform_fee: num(r.platform_fee),
        driver_earnings: num(r.driver_earnings),
        tip_amount: num(r.tip_amount),
        payment_method: r.payment_method ?? null,
        is_collected: Boolean(r.is_collected),
        passenger_name: r.passenger_name ?? null,
      })),
      total,
      limit,
      offset,
      totals_in_filter: {
        trip_count: num(totalsRow?.trip_count),
        gross_fare: num(totalsRow?.gross_fare),
        platform_fee: num(totalsRow?.platform_fee),
        driver_earnings: num(totalsRow?.driver_earnings),
      },
    };
  },
};
