import { describe, expect, test } from 'bun:test';
import { AppError } from './errors';
import { MOTO_MIN_ENGINE_CC, assertVehicleEngineCc } from './vehicle-engine-cc';

describe('vehicle engine_cc policy', () => {
  test('constants', () => {
    expect(MOTO_MIN_ENGINE_CC).toBe(150);
  });

  test('moto 150+ ok', () => {
    expect(assertVehicleEngineCc(150, 'motorcycle')).toBe(150);
    expect(assertVehicleEngineCc(250, 'moto')).toBe(250);
    expect(assertVehicleEngineCc(150, 'Moto')).toBe(150);
  });

  test('moto 149 / missing / non-integer → VEHICLE_ENGINE_CC_INVALID', () => {
    for (const bad of [149, 0, null, undefined, 150.5, Number.NaN]) {
      try {
        assertVehicleEngineCc(bad as number | null | undefined, 'motorcycle');
        expect.unreachable('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe('VEHICLE_ENGINE_CC_INVALID');
        expect(appErr.message).toContain('150');
      }
    }
  });

  test('car forces null even if cc sent', () => {
    expect(assertVehicleEngineCc(250, 'car')).toBeNull();
    expect(assertVehicleEngineCc(150, 'auto')).toBeNull();
    expect(assertVehicleEngineCc(null, 'car')).toBeNull();
    expect(assertVehicleEngineCc(undefined, 'car')).toBeNull();
    expect(assertVehicleEngineCc(200, 'pickup')).toBeNull();
  });
});
