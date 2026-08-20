import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { fuelPriceLog } from '../db/schema';
import { AppError } from './errors';
import { type FareInput, type FareResult, calculatePlatformFee } from './pricing';

export type { FareResult } from './pricing';

const FUEL_REFERENCE_PRICE = 2100;

const CONSUMPTION = {
  auto: 10,
  moto: 37,
} as const;

type VehicleType = 'auto' | 'moto';

interface RateItem {
  base: number;
  fuelShare: number;
}

interface KmTramo {
  min: number;
  max: number;
  base: number;
  fuelShare: number;
}

interface RateConfig {
  tarifaMinima: RateItem;
  tarifaBase: RateItem;
  porKm: KmTramo[];
  porMinuto: RateItem;
}

interface RecalculatedRates {
  changed: true;
  fuelPriceUsed: number;
  fuelReferenceUsed: number;
  fuelDeltaPct: number;
  tarifaMinima: number;
  tarifaBase: number;
  porKm: Array<{ min: number; max: number; tarifa: number }>;
  porMinuto: number;
}

interface UnchangedRates {
  changed: false;
  reason: string;
}

const RATE_CONFIG: Record<VehicleType, RateConfig> = {
  auto: {
    tarifaMinima: { base: 1890, fuelShare: 0.05 },
    tarifaBase: { base: 950, fuelShare: 0.1 },
    porKm: [
      { min: 0, max: 6, base: 340, fuelShare: 0.6 },
      { min: 6, max: 11, base: 390, fuelShare: 0.53 },
      { min: 11, max: Number.POSITIVE_INFINITY, base: 440, fuelShare: 0.47 },
    ],
    porMinuto: { base: 68, fuelShare: 0 },
  },
  moto: {
    tarifaMinima: { base: 1690, fuelShare: 0.03 },
    tarifaBase: { base: 650, fuelShare: 0.05 },
    porKm: [
      { min: 0, max: 6, base: 255, fuelShare: 0.21 },
      { min: 6, max: 11, base: 300, fuelShare: 0.18 },
      { min: 11, max: Number.POSITIVE_INFINITY, base: 330, fuelShare: 0.16 },
    ],
    porMinuto: { base: 50, fuelShare: 0 },
  },
};

const FUEL_PRICE_SANITY_RANGE = { min: 500, max: 6000 };
const EXPECTED_UPDATE_FREQUENCY_DAYS = 7;

function indexValue(baseValue: number, fuelShare: number, currentFuelPrice: number): number {
  const fuelDelta = currentFuelPrice / FUEL_REFERENCE_PRICE - 1;
  return baseValue * (1 + fuelShare * fuelDelta);
}

function roundToStep(value: number, step = 5): number {
  return Math.round(value / step) * step;
}

export async function getCurrentFuelPrice(): Promise<number> {
  const [row] = await db
    .select({ price: fuelPriceLog.price })
    .from(fuelPriceLog)
    .orderBy(desc(fuelPriceLog.created_at))
    .limit(1);

  return row?.price ?? FUEL_REFERENCE_PRICE;
}

export async function getFuelPriceStatus() {
  const [last] = await db
    .select()
    .from(fuelPriceLog)
    .orderBy(desc(fuelPriceLog.created_at))
    .limit(1);

  if (!last) {
    return {
      currentPrice: FUEL_REFERENCE_PRICE,
      lastUpdatedAt: null,
      lastUpdatedBy: null,
      daysSinceUpdate: null,
      isStale: true,
    };
  }

  const daysSinceUpdate = (Date.now() - last.created_at.getTime()) / (1000 * 60 * 60 * 24);

  return {
    currentPrice: last.price,
    lastUpdatedAt: last.created_at.toISOString(),
    lastUpdatedBy: last.updated_by,
    daysSinceUpdate: +daysSinceUpdate.toFixed(1),
    isStale: daysSinceUpdate > EXPECTED_UPDATE_FREQUENCY_DAYS,
  };
}

export async function getFuelPriceHistory() {
  return db.select().from(fuelPriceLog).orderBy(desc(fuelPriceLog.created_at)).limit(100);
}

export interface SetFuelPriceMeta {
  updatedBy: string;
  source?: string | null;
  notes?: string | null;
  force?: boolean;
}

export interface SetFuelPriceResult {
  applied: boolean;
  entry?: typeof fuelPriceLog.$inferSelect;
  warning?: string;
  warnings?: string[];
}

export async function setFuelPrice(
  price: number,
  meta: SetFuelPriceMeta,
): Promise<SetFuelPriceResult> {
  const { updatedBy, source = null, notes = null, force = false } = meta;

  if (!updatedBy) {
    throw new AppError(
      'setFuelPrice requiere updatedBy (quién carga el precio)',
      400,
      'BAD_REQUEST',
    );
  }
  if (typeof price !== 'number' || Number.isNaN(price) || price <= 0) {
    throw new AppError('El precio debe ser un número positivo', 400, 'BAD_REQUEST');
  }
  if (price < FUEL_PRICE_SANITY_RANGE.min || price > FUEL_PRICE_SANITY_RANGE.max) {
    throw new AppError(
      `Precio fuera de rango esperado ($${FUEL_PRICE_SANITY_RANGE.min}-$${FUEL_PRICE_SANITY_RANGE.max}). Revisá que no sea un error de tipeo.`,
      400,
      'BAD_REQUEST',
    );
  }

  const currentPrice = await getCurrentFuelPrice();
  const changePct = Math.abs(price / currentPrice - 1);
  const warnings: string[] = [];

  if (changePct > 0.25 && !force) {
    return {
      applied: false,
      warning: `El nuevo precio difiere un ${(changePct * 100).toFixed(1)}% del último cargado ($${currentPrice.toFixed(0)} → $${price}). Si es correcto, reenviá con force: true.`,
    };
  }
  if (changePct > 0.1) {
    warnings.push(
      `Variación importante respecto a la última carga: ${(changePct * 100).toFixed(1)}%`,
    );
  }

  const [entry] = await db
    .insert(fuelPriceLog)
    .values({ price, updated_by: updatedBy, source, notes })
    .returning();

  return { applied: true, entry, warnings: warnings.length > 0 ? warnings : undefined };
}

export async function getEffectiveRates(
  vehicleType: VehicleType,
  currentFuelPrice?: number,
): Promise<RecalculatedRates | UnchangedRates | null> {
  const fuelPrice = currentFuelPrice ?? (await getCurrentFuelPrice());
  const config = RATE_CONFIG[vehicleType];
  if (!config) return null;

  const threshold = 0.05;
  const maxChangePct = 0.15;
  const roundStep = 5;

  const fuelDelta = Math.abs(fuelPrice / FUEL_REFERENCE_PRICE - 1);

  if (fuelDelta < threshold) {
    return {
      changed: false,
      reason: `Variación de nafta (${(fuelDelta * 100).toFixed(1)}%) por debajo del umbral (${threshold * 100}%)`,
    };
  }

  const clamp = (newVal: number, oldVal: number) => {
    const maxUp = oldVal * (1 + maxChangePct);
    const maxDown = oldVal * (1 - maxChangePct);
    return Math.min(Math.max(newVal, maxDown), maxUp);
  };

  const applyAndRound = (item: RateItem) => {
    const raw = indexValue(item.base, item.fuelShare, fuelPrice);
    const clamped = clamp(raw, item.base);
    return roundToStep(clamped, roundStep);
  };

  return {
    changed: true,
    fuelPriceUsed: fuelPrice,
    fuelReferenceUsed: FUEL_REFERENCE_PRICE,
    fuelDeltaPct: +(fuelDelta * 100).toFixed(2),
    tarifaMinima: applyAndRound(config.tarifaMinima),
    tarifaBase: applyAndRound(config.tarifaBase),
    porKm: config.porKm.map((tramo) => ({
      min: tramo.min,
      max: tramo.max,
      tarifa: applyAndRound(tramo),
    })),
    porMinuto: applyAndRound(config.porMinuto),
  };
}

function mapToVehicleType(inputType: string): VehicleType {
  if (inputType === 'car' || inputType === 'auto') return 'auto';
  if (inputType === 'motorcycle' || inputType === 'moto') return 'moto';
  throw new AppError('Invalid vehicle type', 400, 'BAD_REQUEST');
}

export async function calculateFare(input: FareInput): Promise<FareResult> {
  const vehicleType = mapToVehicleType(input.vehicle_type);

  // Defensive validation: a non-positive distance would produce a fare that is
  // floored at the minimum and, worse, would make the completion-time distance
  // reconciliation skip (it only runs for positive distances), leaving room to
  // undercharge the passenger on a long trip. Reject early.
  if (!Number.isFinite(input.distance_km) || input.distance_km <= 0) {
    throw new AppError('Distance must be positive', 400, 'BAD_REQUEST');
  }
  if (!Number.isFinite(input.duration_minutes) || input.duration_minutes <= 0) {
    throw new AppError('Duration must be positive', 400, 'BAD_REQUEST');
  }

  const rates = await getEffectiveRates(vehicleType);
  const config = RATE_CONFIG[vehicleType];
  const commissionRate = input.commission_rate ?? 0.2; // dynamic rate passed by caller

  // The fare is ALWAYS computed with the same tiered (per-tramo) model.
  // When the fuel variation is below the threshold we use the base config
  // rates; when it is above we use the fuel-indexed rates. Fuel only scales
  // the rates, it never changes the shape of the calculation. This keeps the
  // total monotonic w.r.t. the fuel price and removes a discontinuity where a
  // fuel-price change could previously switch the calculation to a cheaper
  // single-rate model (charging the passenger less than before).
  const porKm = rates?.changed
    ? rates.porKm
    : config.porKm.map((t) => ({ min: t.min, max: t.max, tarifa: t.base }));
  const tarifaBase = rates?.changed ? rates.tarifaBase : config.tarifaBase.base;
  const tarifaMinima = rates?.changed ? rates.tarifaMinima : config.tarifaMinima.base;
  const porMinuto = rates?.changed ? rates.porMinuto : config.porMinuto.base;

  let kmCost = 0;
  let remaining = input.distance_km;
  for (const tramo of porKm) {
    const tramoWidth = (tramo.max === Number.POSITIVE_INFINITY ? remaining : tramo.max) - tramo.min;
    const kmEnTramo = Math.max(0, Math.min(remaining, tramoWidth));
    kmCost += kmEnTramo * tramo.tarifa;
    remaining -= kmEnTramo;
    if (remaining <= 0) break;
  }

  const base_fare = tarifaBase;
  const distance_fare = Math.round(kmCost * 100) / 100;
  const time_fare = Math.round(input.duration_minutes * porMinuto * 100) / 100;
  let total = Math.round(base_fare + distance_fare + time_fare);

  if (total < tarifaMinima) {
    total = tarifaMinima;
  }

  const platform_fee = calculatePlatformFee(total, commissionRate);
  const driver_earnings = total - platform_fee;

  return { base_fare, distance_fare, time_fare, total, platform_fee, driver_earnings };
}
