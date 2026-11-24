import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { platformConfig } from '../db/schema';

export interface CommissionConfig {
  phase: string;
  currentDay: number;
  rate: number;
  /** Inclusive day bounds (compat shape; flat rate has no window). */
  phaseDayStart: number;
  phaseDayEnd: number | null;
}

export type CommissionStageStatus = 'completed' | 'current' | 'upcoming';

/** Driver-facing scheme (single current rate; no multi-phase timeline). */
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

export const COMMISSION_RATE_KEY = 'commission_rate';

/** Soft cap: platform fee fraction 0–0.30 (0%–30%). Above 0.30 clamps to 0.30. */
export const COMMISSION_RATE_SOFT_CAP = 0.3;

const FLAT_PHASE = 'Vigente';
const FLAT_STAGE_ID = 'flat';
const FLAT_TITLE = 'Tu comisión actual';

const COMMISSION_SCHEME_FOOTNOTE = 'La comisión se descuenta automáticamente de cada viaje.';

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

/**
 * Parse platform_config.commission_rate string → fraction.
 * Missing / empty / NaN / negative → 0 (launch-safe). Soft-cap at 0.30.
 */
export function parseCommissionRate(raw: string | null | undefined): number {
  if (raw == null) return 0;
  const trimmed = String(raw).trim();
  if (!trimmed) return 0;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || Number.isNaN(n) || n < 0) return 0;
  if (n > COMMISSION_RATE_SOFT_CAP) return COMMISSION_RATE_SOFT_CAP;
  return n;
}

export async function getCommissionRate(
  db: NodePgDatabase,
  _now: Date = new Date(),
): Promise<number> {
  const raw = await getConfig(db, COMMISSION_RATE_KEY);
  return parseCommissionRate(raw);
}

export const DEFAULT_DEBT_CAP_ARS = 10000;

export async function getDebtCapArs(db: NodePgDatabase): Promise<number> {
  const value = await getConfig(db, 'platform.debt_cap_ars');
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? DEFAULT_DEBT_CAP_ARS : parsed;
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
  if (!trimmed || trimmed === FLAT_PHASE || trimmed === 'flat') return FLAT_TITLE;
  return trimmed;
}

export function driverBlurbForRate(rate: number): string {
  const ratePct = toRatePct(rate);
  if (rate <= 0 || ratePct <= 0) {
    return 'Hoy te quedás con el 100% de tus ganancias.';
  }
  const pct = formatRatePctLabel(ratePct);
  const keep = formatRatePctLabel(100 - ratePct);
  return `Por cada viaje, Lifty retiene el ${pct}%. Tus ganancias: ${keep}% de la tarifa restante.`;
}

/** Compat shape for admin dashboard / earnings — rate from flat config only. */
export async function getCommissionConfig(
  db: NodePgDatabase,
  _now: Date = new Date(),
): Promise<CommissionConfig> {
  const rate = await getCommissionRate(db);
  return {
    phase: FLAT_PHASE,
    currentDay: 1,
    rate,
    phaseDayStart: 1,
    phaseDayEnd: null,
  };
}

/**
 * Single-stage scheme for driver Cobros (no multi-phase timeline).
 */
export async function getCommissionScheme(
  db: NodePgDatabase,
  now: Date = new Date(),
  configOverride?: CommissionConfig,
): Promise<CommissionScheme> {
  const config = configOverride ?? (await getCommissionConfig(db, now));
  const ratePct = toRatePct(config.rate);
  const title = driverTitleForPhase(config.phase);
  const blurb = driverBlurbForRate(config.rate);

  const current: CommissionSchemeCurrent = {
    title,
    rate: config.rate,
    rate_pct: ratePct,
    blurb,
    phase: config.phase,
  };

  const stages: CommissionSchemeStage[] = [
    {
      id: FLAT_STAGE_ID,
      title,
      rate: config.rate,
      rate_pct: ratePct,
      blurb,
      status: 'current',
      order: 1,
    },
  ];

  return {
    current,
    stages,
    footnote: COMMISSION_SCHEME_FOOTNOTE,
  };
}
