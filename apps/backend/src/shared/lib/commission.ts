import { and, eq, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { commissionPhases, platformConfig } from '../db/schema';

export interface CommissionConfig {
  phase: string;
  currentDay: number;
  rate: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEV_DEFAULT_START = '2026-10-01';

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

export const DEFAULT_DEBT_CAP_ARS = 6000;

export async function getDebtCapArs(db: NodePgDatabase): Promise<number> {
  const value = await getConfig(db, 'platform.debt_cap_ars');
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? DEFAULT_DEBT_CAP_ARS : parsed;
}

/** Day 1 = UTC calendar date of start (inclusive). Before start → day 1. */
export function differenceInCalendarDaysUtc(now: Date, start: Date): number {
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  return Math.floor((nowUtc - startUtc) / MS_PER_DAY);
}

export function currentCommissionDay(now: Date, startDate: Date): number {
  return Math.max(1, differenceInCalendarDaysUtc(now, startDate) + 1);
}

function rateForPhase(
  phase: {
    name: string;
    day_start: number;
    base_rate: number;
    daily_increment: number | null;
    cap_rate: number | null;
  },
  currentDay: number,
): number {
  let rate = phase.base_rate;
  if (phase.daily_increment != null) {
    const extraDays = currentDay - phase.day_start;
    rate = phase.base_rate + extraDays * phase.daily_increment;
    if (phase.cap_rate != null) {
      rate = Math.min(rate, phase.cap_rate);
    }
  }
  return rate;
}

export async function getCommissionConfig(
  db: NodePgDatabase,
  now: Date = new Date(),
): Promise<CommissionConfig> {
  const dateStr = (await getConfig(db, 'commission_start_date')) || DEV_DEFAULT_START;
  const startDate = new Date(`${dateStr}T00:00:00Z`);
  const currentDay = currentCommissionDay(now, startDate);

  const [phase] = await db
    .select()
    .from(commissionPhases)
    .where(
      and(
        lte(commissionPhases.day_start, currentDay),
        sql`(${commissionPhases.day_end} IS NULL OR ${commissionPhases.day_end} >= ${currentDay})`,
      ),
    )
    .limit(1);

  if (!phase) {
    throw new Error(`No commission phase found for day ${currentDay}`);
  }

  return {
    phase: phase.name,
    currentDay,
    rate: rateForPhase(phase, currentDay),
  };
}
