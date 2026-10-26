/** UI labels shown on OnboardingVehicle. Backend stores English slugs. */
export type VehicleTypeUi = 'Auto' | 'Moto';

/** Normativa Lifty: piso histórico 2011 + antigüedad máx. 15 años. */
export const VEHICLE_MIN_MODEL_YEAR = 2011;
export const VEHICLE_MAX_AGE_YEARS = 15;

/** Ops lock: solo motos ≥ 150 cc (inclusive). */
export const MOTO_MIN_ENGINE_CC = 150;

/**
 * ANSV Licencia Nacional — motos 2 ruedas = A 1.x
 * https://www.argentina.gob.ar/seguridadvial/licencianacional/clasesysubclases
 * Lifty floor ≥150 → A1.1 out; A1.2 only at 150 cc.
 */
export const MOTO_LICENSE_CATEGORIES = ['A1.2', 'A1.3', 'A1.4'] as const;
export type MotoLicenseCategory = (typeof MOTO_LICENSE_CATEGORIES)[number];

export const MOTO_LICENSE_CHIP_META: Record<
  MotoLicenseCategory,
  { rangeLabel: string; min: number; max: number | null }
> = {
  'A1.2': { rangeLabel: 'hasta 150 cc', min: MOTO_MIN_ENGINE_CC, max: 150 },
  'A1.3': { rangeLabel: '151–300 cc', min: 151, max: 300 },
  'A1.4': { rangeLabel: '+300 cc', min: 301, max: null },
};

/** Normalize client/DB token → A1.2 | A1.3 | A1.4 | other. */
export function normalizeMotoLicenseCategory(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  const m = s.match(/^A\.?1[.\-]?([234])$/);
  if (m) return `A1.${m[1]}`;
  if ((MOTO_LICENSE_CATEGORIES as readonly string[]).includes(s)) return s;
  // Legacy early Lifty chips
  if (s === 'A2') return 'A1.2';
  if (s === 'A3') return 'A1.3';
  if (s === 'A4') return 'A1.4';
  return s;
}

export function isAllowedMotoLicenseCategory(raw: string | null | undefined): boolean {
  return (MOTO_LICENSE_CATEGORIES as readonly string[]).includes(normalizeMotoLicenseCategory(raw));
}

export function motoLicenseCategoryForEngineCc(cc: number): MotoLicenseCategory | null {
  if (!Number.isInteger(cc) || cc < MOTO_MIN_ENGINE_CC) return null;
  if (cc <= 150) return 'A1.2';
  if (cc <= 300) return 'A1.3';
  return 'A1.4';
}

/**
 * AR plate formats (DNRPA), after stripping spaces/hyphens.
 * Auto:
 * - Mercosur (2016+): 2 letras + 3 dígitos + 2 letras (AB123CD)
 * - Nacional 1995–2016: 3 letras + 3 dígitos (ABC123)
 * Moto:
 * - Mercosur: 1 letra + 3 dígitos + 3 letras (A123BCD)
 * - Previo: 3 dígitos + 3 letras (123ABC)
 */
const PLATE_AUTO_MERCOSUR = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;
const PLATE_AUTO_CLASSIC = /^[A-Z]{3}[0-9]{3}$/;
const PLATE_MOTO_MERCOSUR = /^[A-Z][0-9]{3}[A-Z]{3}$/;
const PLATE_MOTO_CLASSIC = /^[0-9]{3}[A-Z]{3}$/;

/** Strip spaces/hyphens and uppercase for validate + PUT body. */
export function normalizeVehiclePlate(value: string): string {
  return value.replace(/[\s\-]+/g, '').toUpperCase();
}

/** Field error or undefined if empty/valid. Empty → required elsewhere. Spaces stripped for match. */
export function validateVehiclePlate(
  value: string,
  type: VehicleTypeUi = 'Auto',
): string | undefined {
  if (!value.trim()) return undefined;
  const plate = normalizeVehiclePlate(value);
  if (type === 'Moto') {
    if (PLATE_MOTO_MERCOSUR.test(plate) || PLATE_MOTO_CLASSIC.test(plate)) return undefined;
    return 'Formato inválido. Usá A123BCD o 123ABC.';
  }
  if (PLATE_AUTO_MERCOSUR.test(plate) || PLATE_AUTO_CLASSIC.test(plate)) return undefined;
  return 'Formato inválido. Usá AB123CD o ABC123.';
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

/** Field error if class + cc don't match ANSV band (after floor ≥150). */
export function validateMotoLicenseVsEngineCc(
  categoryRaw: string,
  engineCcRaw: string,
): string | undefined {
  if (!categoryRaw.trim() || !engineCcRaw.trim()) return undefined;
  const cat = normalizeMotoLicenseCategory(categoryRaw);
  if (!(MOTO_LICENSE_CATEGORIES as readonly string[]).includes(cat)) {
    return 'Elegí A1.2, A1.3 o A1.4 (como en tu licencia nacional).';
  }
  const ccErr = validateVehicleEngineCc(engineCcRaw, 'Moto');
  if (ccErr) return ccErr;
  const cc = Number.parseInt(engineCcRaw.trim(), 10);
  const meta = MOTO_LICENSE_CHIP_META[cat as MotoLicenseCategory];
  const inRange = cc >= meta.min && (meta.max == null || cc <= meta.max);
  if (inRange) return undefined;
  const suggested = motoLicenseCategoryForEngineCc(cc);
  return suggested
    ? `Con ${cc} cc corresponde clase ${suggested} (${MOTO_LICENSE_CHIP_META[suggested].rangeLabel}).`
    : `La clase ${cat} no coincide con ${cc} cc.`;
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
