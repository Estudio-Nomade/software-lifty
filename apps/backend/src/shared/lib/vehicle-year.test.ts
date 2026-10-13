import { describe, expect, test } from 'bun:test';
import { AppError } from './errors';
import {
  VEHICLE_MAX_AGE_YEARS,
  VEHICLE_MIN_MODEL_YEAR,
  assertVehicleYear,
  getVehicleYearBounds,
  isVehicleYearAllowed,
} from './vehicle-year';

describe('vehicle year policy', () => {
  test('constants', () => {
    expect(VEHICLE_MIN_MODEL_YEAR).toBe(2011);
    expect(VEHICLE_MAX_AGE_YEARS).toBe(15);
  });

  test('2026-06-01 → minYear 2011; 2010 reject; 2011 ok', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const bounds = getVehicleYearBounds(now);
    expect(bounds.currentYear).toBe(2026);
    expect(bounds.minYear).toBe(2011);
    expect(bounds.maxYear).toBe(2027);
    expect(isVehicleYearAllowed(2010, now)).toBe(false);
    expect(isVehicleYearAllowed(2011, now)).toBe(true);
    expect(isVehicleYearAllowed(2009, now)).toBe(false);
    expect(isVehicleYearAllowed(2026, now)).toBe(true);
    expect(isVehicleYearAllowed(2027, now)).toBe(true);
    expect(isVehicleYearAllowed(2028, now)).toBe(false);
  });

  test('2025-01-01 → minYear 2011; 2011 ok; 2010 reject', () => {
    const now = new Date('2025-01-01T12:00:00.000Z');
    const bounds = getVehicleYearBounds(now);
    expect(bounds.minYear).toBe(2011);
    expect(bounds.maxYear).toBe(2026);
    expect(isVehicleYearAllowed(2011, now)).toBe(true);
    expect(isVehicleYearAllowed(2010, now)).toBe(false);
    expect(isVehicleYearAllowed(2009, now)).toBe(false);
  });

  test('2030 → minYear 2015', () => {
    const now = new Date('2030-07-15T12:00:00.000Z');
    expect(getVehicleYearBounds(now).minYear).toBe(2015);
    expect(isVehicleYearAllowed(2014, now)).toBe(false);
    expect(isVehicleYearAllowed(2015, now)).toBe(true);
  });

  test('assertVehicleYear throws VEHICLE_YEAR_INVALID', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    try {
      assertVehicleYear(2010, now);
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe('VEHICLE_YEAR_INVALID');
      expect(appErr.message).toContain('No podés registrarte');
      expect(appErr.message).toContain('2011');
    }
  });

  test('assertVehicleYear rejects non-integer', () => {
    expect(() => assertVehicleYear(2011.5)).toThrow(AppError);
    expect(() => assertVehicleYear(Number.NaN)).toThrow(AppError);
  });
});
