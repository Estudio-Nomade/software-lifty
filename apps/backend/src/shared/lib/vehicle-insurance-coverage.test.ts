import { describe, expect, test } from 'bun:test';
import { AppError } from './errors';
import {
  INSURANCE_COVERAGE_TYPES,
  assertInsuranceCoverageForVehicle,
  hasValidMotoInsuranceCoverage,
} from './vehicle-insurance-coverage';

describe('vehicle insurance coverage policy', () => {
  test('constants', () => {
    expect([...INSURANCE_COVERAGE_TYPES]).toEqual(['third_party', 'comprehensive']);
  });

  test('moto accepts third_party and comprehensive', () => {
    expect(assertInsuranceCoverageForVehicle('third_party', 'motorcycle')).toBe('third_party');
    expect(assertInsuranceCoverageForVehicle('comprehensive', 'moto')).toBe('comprehensive');
    expect(assertInsuranceCoverageForVehicle('THIRD_PARTY', 'Moto')).toBe('third_party');
  });

  test('moto required missing/invalid → VEHICLE_INSURANCE_COVERAGE_INVALID', () => {
    for (const bad of [null, undefined, '', '  ', 'todo_riesgo', 'rc']) {
      try {
        assertInsuranceCoverageForVehicle(bad as string | null | undefined, 'motorcycle', {
          required: true,
        });
        expect.unreachable('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe('VEHICLE_INSURANCE_COVERAGE_INVALID');
      }
    }
  });

  test('moto optional unset stays null', () => {
    expect(assertInsuranceCoverageForVehicle(null, 'motorcycle')).toBeNull();
    expect(assertInsuranceCoverageForVehicle(undefined, 'moto')).toBeNull();
  });

  test('car forces null even if coverage sent', () => {
    expect(assertInsuranceCoverageForVehicle('comprehensive', 'car')).toBeNull();
    expect(assertInsuranceCoverageForVehicle('third_party', 'auto')).toBeNull();
    expect(assertInsuranceCoverageForVehicle(null, 'car')).toBeNull();
    expect(assertInsuranceCoverageForVehicle('comprehensive', 'pickup')).toBeNull();
  });

  test('hasValidMotoInsuranceCoverage', () => {
    expect(hasValidMotoInsuranceCoverage('car', null)).toBe(true);
    expect(hasValidMotoInsuranceCoverage('motorcycle', null)).toBe(false);
    expect(hasValidMotoInsuranceCoverage('motorcycle', 'third_party')).toBe(true);
    expect(hasValidMotoInsuranceCoverage('moto', 'comprehensive')).toBe(true);
    expect(hasValidMotoInsuranceCoverage('motorcycle', 'nope')).toBe(false);
  });
});
