/** UI labels shown on OnboardingVehicle. Backend stores English slugs. */
export type VehicleTypeUi = 'Auto' | 'Moto';

/** Normativa Lifty: piso histórico 2011 + antigüedad máx. 15 años. */
export const VEHICLE_MIN_MODEL_YEAR = 2011;
export const VEHICLE_MAX_AGE_YEARS = 15;

/** Ops lock: solo motos ≥ 150 cc (inclusive). */
export const MOTO_MIN_ENGINE_CC = 150;

/**
 * AR plate formats (auto + moto), after stripping spaces/hyphens:
 * - Mercosur unificado: 2 letras + 3 dígitos + 2 letras (AB123CD)
 * - Nacional previo: 3 letras + 3 dígitos (ABC123)
 */
const PLATE_MERCOSUR = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;
const PLATE_CLASSIC = /^[A-Z]{3}[0-9]{3}$/;

/** Strip spaces/hyphens and uppercase for validate + PUT body. */
export function normalizeVehiclePlate(value: string): string {
  return value.replace(/[\s\-]+/g, '').toUpperCase();
}

/** Field error or undefined if empty/valid. Empty → required elsewhere. Spaces OK while typing. */
export function validateVehiclePlate(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const plate = normalizeVehiclePlate(value);
  if (PLATE_MERCOSUR.test(plate) || PLATE_CLASSIC.test(plate)) return undefined;
  return 'Formato inválido. Usá ABC123 o AB123CD (Mercosur).';
}

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
  if (Number.isNaN(num) || !Number.isInteger(num)) {
    return 'Ingresá un año válido (4 dígitos).';
  }
  if (num < minYear) {
    return `No podés registrarte con un vehículo ${num}. Lifty solo admite modelos ${minYear} o más nuevos.`;
  }
  if (num > maxYear) {
    return `El año no puede ser mayor a ${maxYear}.`;
  }
  return undefined;
}

/**
 * Moto: require integer ≥ 150. Auto: no field error (UI hides field).
 * Empty moto value → undefined here; required handled by hasCompleteVehicle / form.
 */
export function validateVehicleEngineCc(value: string, type: VehicleTypeUi): string | undefined {
  if (type !== 'Moto') return undefined;
  if (!value.trim()) return undefined;
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num) || !Number.isInteger(num) || String(num) !== value.trim()) {
    return 'Ingresá la cilindrada en cc (número entero).';
  }
  if (num < MOTO_MIN_ENGINE_CC) {
    return `Por ahora solo motos de ${MOTO_MIN_ENGINE_CC} cc o más. Debe coincidir con la cédula.`;
  }
  return undefined;
}

const UI_TO_API: Record<VehicleTypeUi, string> = {
  Auto: 'car',
  Moto: 'motorcycle',
};

/** Legacy pickup/van/camioneta hydrate as Auto (no third chip). */
const API_TO_UI: Record<string, VehicleTypeUi> = {
  car: 'Auto',
  motorcycle: 'Moto',
  moto: 'Moto',
  auto: 'Auto',
  pickup: 'Auto',
  van: 'Auto',
  camioneta: 'Auto',
  Auto: 'Auto',
  Moto: 'Moto',
  Camioneta: 'Auto',
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
  /** Empty string when auto or unknown. */
  engineCc: string;
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
        vehicle_type?: string | null;
        engine_cc?: number | string | null;
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
  if (!(plate && brand && model && color && year)) return false;

  const type = vehicleTypeFromApi(v.vehicle_type);
  if (type === 'Moto') {
    const ccRaw = v.engine_cc == null ? '' : String(v.engine_cc).trim();
    if (!ccRaw || validateVehicleEngineCc(ccRaw, 'Moto')) return false;
  }
  return true;
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
        engine_cc?: number | string | null;
      }
    | null
    | undefined,
): VehicleFormValues | null {
  if (!vehicle || !hasCompleteVehicle(vehicle)) return null;
  const type = vehicleTypeFromApi(vehicle.vehicle_type);
  const engineCc =
    type === 'Moto' && vehicle.engine_cc != null ? String(vehicle.engine_cc).trim() : '';
  return {
    plate: normalizeVehiclePlate(String(vehicle.plate ?? '')),
    brand: String(vehicle.brand ?? '').trim(),
    model: String(vehicle.model ?? '').trim(),
    color: String(vehicle.color ?? '').trim(),
    year: String(vehicle.year ?? '').trim(),
    type,
    engineCc,
  };
}
