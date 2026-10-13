import { AppError } from './errors';

export const VEHICLE_MIN_MODEL_YEAR = 2010;
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

export function isVehicleYearAllowed(year: number, now: Date = new Date()): boolean {
  if (!Number.isInteger(year)) return false;
  const { minYear, maxYear } = getVehicleYearBounds(now);
  return year >= minYear && year <= maxYear;
}

export function assertVehicleYear(year: number, now: Date = new Date()): void {
  const { minYear, maxYear } = getVehicleYearBounds(now);
  if (!Number.isInteger(year) || year < minYear || year > maxYear) {
    throw new AppError(
      `El vehículo debe ser modelo ${minYear} o más nuevo (máx. ${VEHICLE_MAX_AGE_YEARS} años de antigüedad; desde ${VEHICLE_MIN_MODEL_YEAR}). Año permitido: ${minYear}–${maxYear}.`,
      400,
      'VEHICLE_YEAR_INVALID',
    );
  }
}
