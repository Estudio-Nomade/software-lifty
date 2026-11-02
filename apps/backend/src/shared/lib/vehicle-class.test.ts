import { describe, expect, test } from 'bun:test';
import {
  normalizeRequestedVehicleType,
  normalizeVehicleClass,
  vehicleTypesCompatible,
} from './vehicle-class';

describe('vehicle-class', () => {
  test('normalizeVehicleClass maps aliases', () => {
    expect(normalizeVehicleClass('auto')).toBe('auto');
    expect(normalizeVehicleClass('car')).toBe('auto');
    expect(normalizeVehicleClass('pickup')).toBe('auto');
    expect(normalizeVehicleClass('van')).toBe('auto');
    expect(normalizeVehicleClass('camioneta')).toBe('auto');
    expect(normalizeVehicleClass('moto')).toBe('moto');
    expect(normalizeVehicleClass('motorcycle')).toBe('moto');
    expect(normalizeVehicleClass('MOTORCYCLE')).toBe('moto');
    expect(normalizeVehicleClass(null)).toBeNull();
    expect(normalizeVehicleClass('')).toBeNull();
    expect(normalizeVehicleClass('boat')).toBeNull();
  });

  test('normalizeRequestedVehicleType rejects unknown', () => {
    expect(normalizeRequestedVehicleType('moto')).toBe('moto');
    expect(() => normalizeRequestedVehicleType('boat')).toThrow();
  });

  test('vehicleTypesCompatible never crosses auto/moto', () => {
    expect(vehicleTypesCompatible('moto', 'motorcycle')).toBe(true);
    expect(vehicleTypesCompatible('moto', 'moto')).toBe(true);
    expect(vehicleTypesCompatible('auto', 'car')).toBe(true);
    expect(vehicleTypesCompatible('auto', 'auto')).toBe(true);
    expect(vehicleTypesCompatible('moto', 'car')).toBe(false);
    expect(vehicleTypesCompatible('auto', 'motorcycle')).toBe(false);
    expect(vehicleTypesCompatible('moto', null)).toBe(false);
    expect(vehicleTypesCompatible('moto', undefined)).toBe(false);
    expect(vehicleTypesCompatible(null, 'car')).toBe(false);
  });
});
