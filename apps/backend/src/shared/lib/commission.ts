import { and, eq, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { commissionPhases, platformConfig } from '../db/schema';

export interface CommissionConfig {
  phase: string;
  currentMonth: number;
  rate: number;
}

export async function getConfig(db: NodePgDatabase, key: string): Promise<string> {
  const [row] = await db
    .select({ value: platformConfig.value })
    .from(platformConfig)
    .where(eq(platformConfig.key, key))
    .limit(1);
  return row?.value ?? '';
}

export async function setConfig(db: NodePgDatabase, key: string, value: string): Promise<void> {
  await db
    .insert(platformConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformConfig.key, set: { value, updated_at: new Date() } });
}

export async function getCommissionRate(
  db: NodePgDatabase,
  now: Date = new Date(),
): Promise<number> {
  const config = await getCommissionConfig(db, now);
  return config.rate;
}

export async function getCommissionConfig(
  db: NodePgDatabase,
  now: Date = new Date(),
): Promise<CommissionConfig> {
  const dateStr = await getConfig(db, 'commission_start_date');
  if (!dateStr) {
    const devStartDate = new Date('2026-10-01T00:00:00Z');
    const devMonth = Math.max(1, differenceInCalendarMonths(now, devStartDate) + 1);
    const [devPhase] = await db
      .select()
      .from(commissionPhases)
      .where(
        and(
          lte(commissionPhases.month_start, devMonth),
          sql`(${commissionPhases.month_end} IS NULL OR ${commissionPhases.month_end} >= ${devMonth})`,
        ),
      )
      .limit(1);
    if (!devPhase) throw new Error('No commission phase found');
    return { phase: devPhase.name, currentMonth: devMonth, rate: devPhase.base_rate };
  }

  const startDate = new Date(`${dateStr}T00:00:00Z`);
  const currentMonth = differenceInCalendarMonths(now, startDate) + 1;

  const [phase] = await db
    .select()
    .from(commissionPhases)
    .where(
      and(
        lte(commissionPhases.month_start, currentMonth),
        sql`(${commissionPhases.month_end} IS NULL OR ${commissionPhases.month_end} >= ${currentMonth})`,
      ),
    )
    .limit(1);

  if (!phase) {
    throw new Error(`No commission phase found for month ${currentMonth}`);
  }

  let rate = phase.base_rate;

  if (phase.monthly_increment != null) {
    const extraMonths = currentMonth - phase.month_start;
    rate = phase.base_rate + extraMonths * phase.monthly_increment;
    if (phase.cap_rate != null) {
      rate = Math.min(rate, phase.cap_rate);
    }
  }

  return { phase: phase.name, currentMonth, rate };
}

function differenceInCalendarMonths(a: Date, b: Date): number {
  return (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth());
}
