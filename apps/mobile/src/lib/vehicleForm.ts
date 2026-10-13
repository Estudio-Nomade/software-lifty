/** UI labels shown on OnboardingVehicle. Backend stores English slugs. */
export type VehicleTypeUi = 'Auto' | 'Moto' | 'Camioneta';

/** Normativa Lifty: piso histórico 2011 + antigüedad máx. 15 años. */
export const VEHICLE_MIN_MODEL_YEAR = 2011;
export const VEHICLE_MAX_AGE_YEARS = 15;

export function getVehicleYearBounds(now: Date = new Date()): {
  currentYear: number;
  minYear: number;
  maxYear: number;
} {
  const currentYear = now.getFullYear();
  return {
    currentYear,
    minYear: Math.max(VEHICLE_MIN_MODEL_YEAR, currentYear - VEHICLE_MAX_AGE_YEARS),
    maxYear: currentYear + 1,
  };
}

/** Field error message, or undefined if empty/valid. Empty is handled by required check. */
export function validateVehicleYear(value: string, now: Date = new Date()): string | undefined {
  if (!value.trim()) return undefined;
  const num = Number.parseInt(value, 10);
  const { minYear, maxYear } = getVehicleYearBounds(now);
  if (Number.isNaN(num) || !Number.isInteger(num) || num < minYear || num > maxYear) {
    return `El vehículo debe ser modelo ${minYear} o más nuevo (máx. ${VEHICLE_MAX_AGE_YEARS} años de antigüedad; desde ${VEHICLE_MIN_MODEL_YEAR}).`;
  }
  return undefined;
}

const UI_TO_API: Record<VehicleTypeUi, string> = {
  Auto: 'car',
  Moto: 'motorcycle',
  Camioneta: 'pickup',
};

const API_TO_UI: Record<string, VehicleTypeUi> = {
  car: 'Auto',
  motorcycle: 'Moto',
  moto: 'Moto',
  pickup: 'Camioneta',
  van: 'Camioneta',
  camioneta: 'Camioneta',
  auto: 'Auto',
  // Already-UI values (legacy rows / mistyped PUTs)
  Auto: 'Auto',
  Moto: 'Moto',
  Camioneta: 'Camioneta',
};

export function vehicleTypeToApi(ui: VehicleTypeUi): string {
  return UI_TO_API[ui] ?? 'car';
}

export function vehicleTypeFromApi(raw: string | null | undefined): VehicleTypeUi {
  if (!raw) return 'Auto';
  return API_TO_UI[raw] ?? API_TO_UI[raw.toLowerCase()] ?? 'Auto';
}

export interface VehicleFormValues {
  plate: string;
  brand: string;
  model: string;
  color: string;
  year: string;
  type: VehicleTypeUi;
}

/** True when the profile already has a usable vehicle (user should not re-type). */
export function hasCompleteVehicle(
  v:
    | {
        plate?: string | null;
        brand?: string | null;
        model?: string | null;
        color?: string | null;
        year?: number | string | null;
      }
    | null
    | undefined,
): boolean {
  if (!v) return false;
  const plate = (v.plate ?? '').trim();
  const brand = (v.brand ?? '').trim();
  const model = (v.model ?? '').trim();
  const color = (v.color ?? '').trim();
  const year = v.year == null ? '' : String(v.year).trim();
  return Boolean(plate && brand && model && color && year);
}

/** Map GET /drivers/me vehicle payload into form state. */
export function vehicleFormFromProfile(
  vehicle:
    | {
        plate?: string | null;
        brand?: string | null;
        model?: string | null;
        color?: string | null;
        year?: number | string | null;
        vehicle_type?: string | null;
      }
    | null
    | undefined,
): VehicleFormValues | null {
  if (!vehicle || !hasCompleteVehicle(vehicle)) return null;
  return {
    plate: String(vehicle.plate ?? '')
      .replace(/\s+/g, '')
      .toUpperCase(),
    brand: String(vehicle.brand ?? '').trim(),
    model: String(vehicle.model ?? '').trim(),
    color: String(vehicle.color ?? '').trim(),
    year: String(vehicle.year ?? '').trim(),
    type: vehicleTypeFromApi(vehicle.vehicle_type),
  };
}
