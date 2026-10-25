import { AppError } from './errors';
import { isMotoVehicleType } from './vehicle-engine-cc';

export const INSURANCE_COVERAGE_TYPES = ['third_party', 'comprehensive'] as const;
export type InsuranceCoverageType = (typeof INSURANCE_COVERAGE_TYPES)[number];

export const MOTO_VEHICLE_TYPES = new Set(['motorcycle', 'moto']);

const COVERAGE_SET = new Set<string>(INSURANCE_COVERAGE_TYPES);

function isCarType(vehicleType: string | null | undefined): boolean {
  const t = String(vehicleType ?? '')
    .trim()
    .toLowerCase();
  return t === 'car' || t === 'auto' || t === 'pickup' || t === 'van' || t === 'camioneta';
}

function invalidCoverageError(): never {
  throw new AppError(
    'Elegí el tipo de cobertura de tu póliza: contra terceros o todo riesgo.',
    400,
    'VEHICLE_INSURANCE_COVERAGE_INVALID',
  );
}

/**
 * Value to persist on vehicles.insurance_coverage_type.
 * - Moto + required: must be third_party | comprehensive.
 * - Moto + optional unset: null (docs→review gate enforces later).
 * - Car/auto: always null (strip client-sent values).
 */
export function assertInsuranceCoverageForVehicle(
  coverage: string | null | undefined,
  vehicleType: string | null | undefined,
  opts?: { required?: boolean },
): InsuranceCoverageType | null {
  if (isMotoVehicleType(vehicleType)) {
    if (coverage == null || String(coverage).trim() === '') {
      if (opts?.required) invalidCoverageError();
      return null;
    }
    const normalized = String(coverage).trim().toLowerCase();
    if (!COVERAGE_SET.has(normalized)) invalidCoverageError();
    return normalized as InsuranceCoverageType;
  }

  if (isCarType(vehicleType) || !String(vehicleType ?? '').trim()) {
    return null;
  }

  return null;
}

/** True when moto already has a valid stored coverage. */
export function hasValidMotoInsuranceCoverage(
  vehicleType: string | null | undefined,
  coverage: string | null | undefined,
): boolean {
  if (!isMotoVehicleType(vehicleType)) return true;
  if (coverage == null || String(coverage).trim() === '') return false;
  const normalized = String(coverage).trim().toLowerCase();
  return COVERAGE_SET.has(normalized);
}
