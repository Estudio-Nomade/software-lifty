import { type SQL, and, count, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { getDriverId } from '../../shared/db/queries';
import { drivers, trips } from '../../shared/db/schema';
import { AppError } from '../../shared/lib/errors';
import type { AuthUser } from '../../shared/middleware/auth';

const COMPLETED_STATUSES = ['completed', 'rated'] as const;

const today = sql`CURRENT_DATE`;
const weekStart = sql`date_trunc('week', CURRENT_DATE)`;
const monthStart = sql`date_trunc('month', CURRENT_DATE)`;
const sevenDaysAgo = sql`CURRENT_DATE - INTERVAL '7 days'`;

async function sumDriverEarnings(driverId: string, since?: SQL): Promise<number> {
  const conditions = [eq(trips.driver_id, driverId), inArray(trips.status, COMPLETED_STATUSES)];
  if (since) conditions.push(gte(trips.created_at, since));

  const [row] = await db
    .select({ total: sum(trips.driver_earnings) })
    .from(trips)
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

export const earningsService = {
  async getDaily(user: AuthUser) {
    const driverId = await getDriverId(user);

    const [driver] = await db
      .select({
        platform_debt: drivers.platform_debt,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    const todayTrips = await db
      .select({
        id: trips.id,
        created_at: trips.created_at,
        origin_address: trips.origin_address,
        total_fare: trips.total_fare,
        platform_fee: trips.platform_fee,
        driver_earnings: trips.driver_earnings,
        payment_method: trips.payment_method,
      })
      .from(trips)
      .where(
        and(
          eq(trips.driver_id, driverId),
          inArray(trips.status, COMPLETED_STATUSES),
          gte(trips.created_at, today),
        ),
      )
      .orderBy(desc(trips.created_at));

    const cash = todayTrips
      .filter((t) => t.payment_method === 'cash')
      .reduce((sum, t) => sum + (Number(t.driver_earnings) || 0), 0);

    const transfer = todayTrips
      .filter((t) => t.payment_method === 'transfer')
      .reduce((sum, t) => sum + (Number(t.driver_earnings) || 0), 0);

    const [weekResult] = await db
      .select({
        total: sum(trips.driver_earnings),
        platform_fee: sum(trips.platform_fee),
        total_fare: sum(trips.total_fare),
      })
      .from(trips)
      .where(
        and(
          eq(trips.driver_id, driverId),
          inArray(trips.status, COMPLETED_STATUSES),
          gte(trips.created_at, weekStart),
        ),
      );

    return {
      total: cash + transfer,
      cash,
      transfer,
      trip_count: todayTrips.length,
      trips: todayTrips,
      week: Number(weekResult?.total ?? 0),
      week_platform_fee: Number(weekResult?.platform_fee ?? 0),
      week_total_fare: Number(weekResult?.total_fare ?? 0),
      platform_debt: Number(driver?.platform_debt ?? 0),
    };
  },

  async getSummary(user: AuthUser) {
    const driverId = await getDriverId(user);

    const [driver] = await db
      .select({ platform_debt: drivers.platform_debt })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    const [todayEarnings, weekEarnings, monthEarnings, totalEarnings] = await Promise.all([
      sumDriverEarnings(driverId, today),
      sumDriverEarnings(driverId, weekStart),
      sumDriverEarnings(driverId, monthStart),
      sumDriverEarnings(driverId),
    ]);

    return {
      today: { earnings: todayEarnings, withdrawals: 0 },
      week: { earnings: weekEarnings, withdrawals: 0 },
      month: { earnings: monthEarnings, withdrawals: 0 },
      available_balance: totalEarnings,
      platform_debt: Number(driver?.platform_debt ?? 0),
    };
  },

  async getHistory(user: AuthUser, page: number, limit: number, from?: string, to?: string) {
    if (from && Number.isNaN(Date.parse(from)))
      throw new AppError('from must be a valid ISO date', 400, 'BAD_REQUEST');
    if (to && Number.isNaN(Date.parse(to)))
      throw new AppError('to must be a valid ISO date', 400, 'BAD_REQUEST');

    const driverId = await getDriverId(user);

    const conditions = [eq(trips.driver_id, driverId), inArray(trips.status, COMPLETED_STATUSES)];
    if (from) conditions.push(gte(trips.created_at, sql`${from}::date`));
    if (to)
      conditions.push(
        lte(trips.created_at, sql`${to}::date + INTERVAL '1 day' - INTERVAL '1 millisecond'`),
      );

    const rows = await db
      .select({
        amount: trips.driver_earnings,
        date: trips.created_at,
        description: trips.id,
      })
      .from(trips)
      .where(and(...conditions))
      .orderBy(desc(trips.created_at));

    const items = rows.map((r) => ({
      type: 'earning' as const,
      amount: Number(r.amount ?? 0),
      date: r.date?.toISOString() ?? null,
      description: r.description as string,
    }));

    const total = items.length;
    const offset = (page - 1) * limit;

    return { items: items.slice(offset, offset + limit), total, page, limit };
  },

  async getStats(user: AuthUser) {
    const driverId = await getDriverId(user);

    const [driver] = await db
      .select({
        rating_avg: drivers.rating_avg,
        created_at: drivers.created_at,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    const [tripStats] = await db
      .select({
        total: count(),
        completed: sql<number>`count(*) filter (where ${inArray(trips.status, COMPLETED_STATUSES)})::int`,
      })
      .from(trips)
      .where(eq(trips.driver_id, driverId));

    const [tvfStats] = await db
      .select({
        completed: sql<number>`count(*) filter (where ${inArray(trips.status, COMPLETED_STATUSES)})::int`,
        cancelled_early: sql<number>`count(*) filter (where ${trips.status} = 'cancelled_early')::int`,
      })
      .from(trips)
      .where(and(eq(trips.driver_id, driverId), gte(trips.created_at, sevenDaysAgo)));

    const completed7d = tvfStats?.completed ?? 0;
    const cancelledEarly7d = tvfStats?.cancelled_early ?? 0;
    const total7d = completed7d + cancelledEarly7d;
    const tvf = total7d === 0 ? 1.0 : Math.round((completed7d / total7d) * 100) / 100;

    const totalTrips = tripStats?.total ?? 0;
    const completedTrips = tripStats?.completed ?? 0;
    const completionRate =
      totalTrips === 0 ? 0 : Math.round((completedTrips / totalTrips) * 100) / 100;

    let seniorityDays = 0;
    if (driver?.created_at) {
      const diffMs = Date.now() - driver.created_at.getTime();
      seniorityDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    const totalEarnings = await sumDriverEarnings(driverId);

    return {
      rating_avg: driver?.rating_avg ?? 0,
      total_trips: totalTrips,
      completion_rate: completionRate,
      tvf,
      seniority_days: seniorityDays,
      total_earnings: totalEarnings,
    };
  },
};
