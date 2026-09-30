import {
  type SQL,
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  sum,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../shared/db/client';
import { districts, drivers, trips, users } from '../../shared/db/schema';
import { getCommissionConfig } from '../../shared/lib/commission';
import { AppError, NotFoundError } from '../../shared/lib/errors';

/** Same completed set as driver earnings. */
export const COMPLETED_TRIP_STATUSES = ['completed', 'rated'] as const;

/** Live trip statuses (driver has accepted / is executing). */
export const IN_PROGRESS_TRIP_STATUSES = ['accepted', 'en_route', 'waiting', 'in_trip'] as const;

export type DashboardRange = 'today' | '7d' | '30d';

const driverUser = alias(users, 'driver_user');
const passengerUser = alias(users, 'passenger_user');

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

function escapeIlike(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Money totals only when filter is completed GMV set (default or exact completed/rated). */
function shouldSumMoney(status?: string): boolean {
  if (!status) return true;
  return (COMPLETED_TRIP_STATUSES as readonly string[]).includes(status);
}

function resolveStatusCondition(status?: string): SQL {
  if (!status) {
    return inArray(trips.status, [...COMPLETED_TRIP_STATUSES]);
  }
  if (status === 'in_progress') {
    return inArray(trips.status, [...IN_PROGRESS_TRIP_STATUSES]);
  }
  return eq(trips.status, status);
}

function mapGlobalTripRow(r: {
  id: string;
  status: string;
  created_at: Date | null;
  origin_address: string | null;
  dest_address: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  total_fare: unknown;
  platform_fee: unknown;
  driver_earnings: unknown;
  tip_amount: unknown;
  payment_method: string | null;
  is_collected: boolean | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_document_number: string | null;
  district_id: string | null;
  district_name: string | null;
  passenger_id: string | null;
  passenger_name: string | null;
}) {
  return {
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
    driver_id: r.driver_id ?? null,
    driver_name: r.driver_name ?? null,
    driver_document_number: r.driver_document_number ?? null,
    district_id: r.district_id ?? null,
    district_name: r.district_name ?? null,
    passenger_id: r.passenger_id ?? null,
    passenger_name: r.passenger_name ?? null,
  };
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

  /**
   * Global ops trip list. Default status = completed+rated (GMV).
   * status=in_progress expands to live set; money totals then 0.
   * Filters use trips.created_at with ISO timestamptz bounds (UTC-style).
   */
  async listGlobalTrips(opts?: {
    limit?: number;
    offset?: number;
    status?: string;
    from?: string;
    to?: string;
    driver_id?: string;
    district_id?: string;
    q?: string;
  }) {
    if (opts?.from && Number.isNaN(Date.parse(opts.from))) {
      throw new AppError('from must be a valid ISO date', 400, 'BAD_REQUEST');
    }
    if (opts?.to && Number.isNaN(Date.parse(opts.to))) {
      throw new AppError('to must be a valid ISO date', 400, 'BAD_REQUEST');
    }

    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
    const offset = Math.max(opts?.offset ?? 0, 0);
    const q = opts?.q?.trim();

    const conditions: SQL[] = [resolveStatusCondition(opts?.status)];

    if (opts?.from) {
      conditions.push(gte(trips.created_at, sql`${opts.from}::timestamptz`));
    }
    if (opts?.to) {
      conditions.push(lte(trips.created_at, sql`${opts.to}::timestamptz`));
    }
    if (opts?.driver_id) {
      conditions.push(eq(trips.driver_id, opts.driver_id));
    }
    if (opts?.district_id) {
      conditions.push(eq(drivers.district_id, opts.district_id));
    }
    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      conditions.push(
        or(
          ilike(driverUser.full_name, pattern),
          ilike(driverUser.email, pattern),
          ilike(driverUser.phone, pattern),
          ilike(driverUser.document_number, pattern),
          ilike(passengerUser.full_name, pattern),
          ilike(trips.origin_address, pattern),
          ilike(trips.dest_address, pattern),
          sql`cast(${trips.id} as text) ilike ${pattern}`,
        )!,
      );
    }

    const whereClause = and(...conditions);
    const sumMoney = shouldSumMoney(opts?.status);

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
          driver_id: trips.driver_id,
          driver_name: driverUser.full_name,
          driver_document_number: driverUser.document_number,
          district_id: drivers.district_id,
          district_name: districts.name,
          passenger_id: trips.passenger_id,
          passenger_name: passengerUser.full_name,
        })
        .from(trips)
        .leftJoin(drivers, eq(trips.driver_id, drivers.id))
        .leftJoin(driverUser, eq(drivers.user_id, driverUser.id))
        .leftJoin(passengerUser, eq(trips.passenger_id, passengerUser.id))
        .leftJoin(districts, eq(drivers.district_id, districts.id))
        .where(whereClause)
        .orderBy(desc(trips.created_at))
        .limit(limit)
        .offset(offset),
      db
        .select({ n: count() })
        .from(trips)
        .leftJoin(drivers, eq(trips.driver_id, drivers.id))
        .leftJoin(driverUser, eq(drivers.user_id, driverUser.id))
        .leftJoin(passengerUser, eq(trips.passenger_id, passengerUser.id))
        .where(whereClause)
        .then((r) => r[0]),
      sumMoney
        ? db
            .select({
              trip_count: count(),
              gross_fare: sum(trips.total_fare),
              platform_fee: sum(trips.platform_fee),
              driver_earnings: sum(trips.driver_earnings),
            })
            .from(trips)
            .leftJoin(drivers, eq(trips.driver_id, drivers.id))
            .leftJoin(driverUser, eq(drivers.user_id, driverUser.id))
            .leftJoin(passengerUser, eq(trips.passenger_id, passengerUser.id))
            .where(whereClause)
            .then((r) => r[0])
        : Promise.resolve(null),
    ]);

    const total = num(countRow?.n);

    return {
      items: rows.map(mapGlobalTripRow),
      total,
      limit,
      offset,
      totals_in_filter: {
        trip_count: sumMoney ? num(totalsRow?.trip_count) : total,
        gross_fare: sumMoney ? num(totalsRow?.gross_fare) : 0,
        platform_fee: sumMoney ? num(totalsRow?.platform_fee) : 0,
        driver_earnings: sumMoney ? num(totalsRow?.driver_earnings) : 0,
      },
    };
  },

  async getGlobalTrip(tripId: string) {
    const [row] = await db
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
        driver_id: trips.driver_id,
        driver_name: driverUser.full_name,
        driver_document_number: driverUser.document_number,
        district_id: drivers.district_id,
        district_name: districts.name,
        passenger_id: trips.passenger_id,
        passenger_name: passengerUser.full_name,
        base_fare: trips.base_fare,
        distance_fare: trips.distance_fare,
        time_fare: trips.time_fare,
        assigned_at: trips.assigned_at,
        updated_at: trips.updated_at,
      })
      .from(trips)
      .leftJoin(drivers, eq(trips.driver_id, drivers.id))
      .leftJoin(driverUser, eq(drivers.user_id, driverUser.id))
      .leftJoin(passengerUser, eq(trips.passenger_id, passengerUser.id))
      .leftJoin(districts, eq(drivers.district_id, districts.id))
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!row) throw new NotFoundError('Trip not found');

    return {
      ...mapGlobalTripRow(row),
      base_fare: row.base_fare != null ? Number(row.base_fare) : null,
      distance_fare: row.distance_fare != null ? Number(row.distance_fare) : null,
      time_fare: row.time_fare != null ? Number(row.time_fare) : null,
      assigned_at: row.assigned_at?.toISOString() ?? null,
      updated_at: row.updated_at?.toISOString() ?? null,
    };
  },
};
