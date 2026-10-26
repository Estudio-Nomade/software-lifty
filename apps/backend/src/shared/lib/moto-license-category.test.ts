import { describe, expect, test } from 'bun:test';
import {
  assertMotoLicenseMatchesEngineCc,
  isAllowedMotoLicenseCategory,
  motoLicenseCategoryForEngineCc,
  motoLicenseMatchesEngineCc,
  normalizeMotoLicenseCategory,
} from './moto-license-category';

describe('moto-license-category (ANSV A1.x)', () => {
  test('normalize accepts dotted and spaced forms + legacy A2/A3/A4', () => {
    expect(normalizeMotoLicenseCategory('a1.2')).toBe('A1.2');
    expect(normalizeMotoLicenseCategory('A 1.3')).toBe('A1.3');
    expect(normalizeMotoLicenseCategory('A.1.4')).toBe('A1.4');
    expect(normalizeMotoLicenseCategory('A1-2')).toBe('A1.2');
    expect(normalizeMotoLicenseCategory('A2')).toBe('A1.2');
    expect(normalizeMotoLicenseCategory('A3')).toBe('A1.3');
    expect(normalizeMotoLicenseCategory('A4')).toBe('A1.4');
    expect(normalizeMotoLicenseCategory('A1.1')).toBe('A1.1');
  });

  test('allowlist is A1.2/A1.3/A1.4 only', () => {
    expect(isAllowedMotoLicenseCategory('A1.2')).toBe(true);
    expect(isAllowedMotoLicenseCategory('A1.1')).toBe(false);
    expect(isAllowedMotoLicenseCategory('A2')).toBe(true); // legacy → A1.2
    expect(isAllowedMotoLicenseCategory('B')).toBe(false);
  });

  test('cc → suggested class', () => {
    expect(motoLicenseCategoryForEngineCc(149)).toBeNull();
    expect(motoLicenseCategoryForEngineCc(150)).toBe('A1.2');
    expect(motoLicenseCategoryForEngineCc(200)).toBe('A1.3');
    expect(motoLicenseCategoryForEngineCc(300)).toBe('A1.3');
    expect(motoLicenseCategoryForEngineCc(301)).toBe('A1.4');
  });

  test('match matrix', () => {
    expect(motoLicenseMatchesEngineCc('A1.2', 150)).toBe(true);
    expect(motoLicenseMatchesEngineCc('A1.2', 151)).toBe(false);
    expect(motoLicenseMatchesEngineCc('A1.3', 150)).toBe(false);
    expect(motoLicenseMatchesEngineCc('A1.3', 151)).toBe(true);
    expect(motoLicenseMatchesEngineCc('A1.3', 300)).toBe(true);
    expect(motoLicenseMatchesEngineCc('A1.3', 301)).toBe(false);
    expect(motoLicenseMatchesEngineCc('A1.4', 300)).toBe(false);
    expect(motoLicenseMatchesEngineCc('A1.4', 301)).toBe(true);
  });

  test('assert throws LICENSE_CATEGORY_CC_MISMATCH', () => {
    try {
      assertMotoLicenseMatchesEngineCc('A1.2', 200);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('LICENSE_CATEGORY_CC_MISMATCH');
      expect(String(e.message)).toMatch(/A1\.3/);
    }
    expect(assertMotoLicenseMatchesEngineCc('A1.4', 400)).toBe('A1.4');
  });
});
