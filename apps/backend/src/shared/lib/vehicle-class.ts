import { AppError } from './errors';
import { isMotoVehicleType } from './vehicle-engine-cc';

/** Canonical trip request / fare class stored on `trips.vehicle_type`. */
export type VehicleClass = 'auto' | 'moto';

const AUTO_DRIVER_TYPES = new Set(['car', 'auto', 'pickup', 'van', 'camioneta']);

/**
 * Normalize any passenger or driver vehicle_type string to the canonical class.
 * Returns null for empty/unknown (fail closed).
 */
export function normalizeVehicleClass(vehicleType: string | null | undefined): VehicleClass | null {
  const t = String(vehicleType ?? '')
    .trim()
    .toLowerCase();
  if (!t) return null;
  if (isMotoVehicleType(t)) return 'moto';
  if (AUTO_DRIVER_TYPES.has(t)) return 'auto';
  return null;
}

/** Persistable trip type from passenger request body (`auto` | `moto` only). */
export function normalizeRequestedVehicleType(input: string): VehicleClass {
  const cls = normalizeVehicleClass(input);
  if (!cls) {
    throw new AppError('Invalid vehicle type', 400, 'BAD_REQUEST');
  }
  return cls;
}

/**
 * True iff the driver's vehicle can take a trip requested as `requested`.
 * Fail closed: missing/unknown driver type never matches.
 */
export function vehicleTypesCompatible(
  requested: string | null | undefined,
  driverVehicleType: string | null | undefined,
): boolean {
  const req = normalizeVehicleClass(requested);
  const drv = normalizeVehicleClass(driverVehicleType);
  if (!req || !drv) return false;
  return req === drv;
}
