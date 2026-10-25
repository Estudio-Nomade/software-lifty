import { AppError } from './errors';

export const MOTO_MIN_ENGINE_CC = 150;

function isMotoType(vehicleType: string | null | undefined): boolean {
  const t = String(vehicleType ?? '')
    .trim()
    .toLowerCase();
  return t === 'motorcycle' || t === 'moto';
}

function isCarType(vehicleType: string | null | undefined): boolean {
  const t = String(vehicleType ?? '')
    .trim()
    .toLowerCase();
  return t === 'car' || t === 'auto' || t === 'pickup' || t === 'van' || t === 'camioneta';
}

/**
 * Returns the engine_cc value to persist.
 * - Moto: require integer ≥ 150; throw VEHICLE_ENGINE_CC_INVALID otherwise.
 * - Car/auto (and legacy pickup): always null (strip any client-sent cc).
 */
export function assertVehicleEngineCc(
  cc: number | null | undefined,
  vehicleType: string | null | undefined,
): number | null {
  if (isMotoType(vehicleType)) {
    if (cc == null || !Number.isInteger(cc) || cc < MOTO_MIN_ENGINE_CC) {
      throw new AppError(
        `Por ahora solo motos de ${MOTO_MIN_ENGINE_CC} cc o más. Ingresá la cilindrada como figura en la cédula.`,
        400,
        'VEHICLE_ENGINE_CC_INVALID',
      );
    }
    return cc;
  }

  // Car / unknown non-moto: force null.
  if (isCarType(vehicleType) || !String(vehicleType ?? '').trim()) {
    return null;
  }

  // Other types: still nullify rather than store invalid data.
  return null;
}
