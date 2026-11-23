import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { commissionPhases, platformConfig } from '../db/schema';

export interface CommissionConfig {
  phase: string;
  currentDay: number;
  rate: number;
  /** Inclusive day bounds of the active phase (same as commission_phases). */
  phaseDayStart: number;
  phaseDayEnd: number | null;
}

export type CommissionStageStatus = 'completed' | 'current' | 'upcoming';

/** Driver-facing progressive scheme (no calendar / day counters). */
export interface CommissionSchemeStage {
  id: string;
  title: string;
  rate: number;
  rate_pct: number;
  blurb: string;
  status: CommissionStageStatus;
  order: number;
}

export interface CommissionSchemeCurrent {
  title: string;
  rate: number;
  rate_pct: number;
  blurb: string;
  phase: string;
}

export interface CommissionScheme {
  current: CommissionSchemeCurrent;
  stages: CommissionSchemeStage[];
  footnote: string;
}

const COMMISSION_SCHEME_FOOTNOTE =
  'Tu comisión se calcula sobre el valor de cada viaje. Podés consultar el detalle de los descuentos en tu historial de viajes.';

/** Human titles for known admin phase names; unknown names pass through. */
const DRIVER_TITLE_BY_PHASE: Record<string, string> = {
  Lanzamiento: 'Beneficio de lanzamiento',
  Medición: 'Comisión promocional',
  Estabilización: 'Comisión estándar',
  Crecimiento: 'Comisión en crecimiento',
};

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

export const DEFAULT_DEBT_CAP_ARS = 10000;

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

export function toRatePct(rate: number): number {
  return Math.round(rate * 10000) / 100;
}

export function formatRatePctLabel(ratePct: number): string {
  if (!Number.isFinite(ratePct)) return '0';
  return String(Math.round(ratePct * 100) / 100);
}

export function driverTitleForPhase(phaseName: string): string {
  const trimmed = (phaseName || '').trim();
  if (!trimmed) return 'Comisión actual';
  return DRIVER_TITLE_BY_PHASE[trimmed] ?? trimmed;
}

export function driverBlurbForRate(rate: number): string {
  const ratePct = toRatePct(rate);
  if (rate <= 0 || ratePct <= 0) {
    return 'Hoy te quedás con el 100% de tus ganancias.';
  }
  const pct = formatRatePctLabel(ratePct);
  return `Por cada viaje, Lifty retiene el ${pct}% del valor correspondiente.`;
}

function stageStatusForDay(
  phase: { day_start: number; day_end: number | null },
  currentDay: number,
): CommissionStageStatus {
  if (phase.day_end != null && phase.day_end < currentDay) return 'completed';
  if (phase.day_start <= currentDay && (phase.day_end == null || phase.day_end >= currentDay)) {
    return 'current';
  }
  return 'upcoming';
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
    phaseDayStart: phase.day_start,
    phaseDayEnd: phase.day_end,
  };
}

/**
 * Progressive scheme for driver Cobros UI.
 * Backend is SoT for rates/order; day bounds stay internal (not exposed on stages).
 */
export async function getCommissionScheme(
  db: NodePgDatabase,
  now: Date = new Date(),
  configOverride?: CommissionConfig,
): Promise<CommissionScheme> {
  const config = configOverride ?? (await getCommissionConfig(db, now));
  const phases = await db.select().from(commissionPhases).orderBy(asc(commissionPhases.day_start));

  const stages: CommissionSchemeStage[] = phases.map((phase, index) => {
    const status = stageStatusForDay(phase, config.currentDay);
    const rate = status === 'current' ? config.rate : phase.base_rate;
    const ratePct = toRatePct(rate);
    const title = driverTitleForPhase(phase.name);
    return {
      id: phase.id,
      title,
      rate,
      rate_pct: ratePct,
      blurb: driverBlurbForRate(rate),
      status,
      order: index + 1,
    };
  });

  const currentStage = stages.find((s) => s.status === 'current');
  const current: CommissionSchemeCurrent = currentStage
    ? {
        title: currentStage.title,
        rate: currentStage.rate,
        rate_pct: currentStage.rate_pct,
        blurb: currentStage.blurb,
        phase: config.phase,
      }
    : {
        title: driverTitleForPhase(config.phase),
        rate: config.rate,
        rate_pct: toRatePct(config.rate),
        blurb: driverBlurbForRate(config.rate),
        phase: config.phase,
      };

  return {
    current,
    stages,
    footnote: COMMISSION_SCHEME_FOOTNOTE,
  };
}
