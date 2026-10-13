import {
  VEHICLE_MAX_AGE_YEARS,
  VEHICLE_MIN_MODEL_YEAR,
  getVehicleYearBounds,
  hasCompleteVehicle,
  validateVehicleYear,
  vehicleFormFromProfile,
  vehicleTypeFromApi,
  vehicleTypeToApi,
} from '../../lib/vehicleForm';

describe('vehicle year policy', () => {
  it('exposes normative constants', () => {
    expect(VEHICLE_MIN_MODEL_YEAR).toBe(2010);
    expect(VEHICLE_MAX_AGE_YEARS).toBe(15);
  });

  it('2026 → minYear 2011; 2010 invalid; 2011 ok', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const { minYear, maxYear } = getVehicleYearBounds(now);
    expect(minYear).toBe(2011);
    expect(maxYear).toBe(2027);
    expect(validateVehicleYear('2010', now)).toMatch(/2011/);
    expect(validateVehicleYear('2011', now)).toBeUndefined();
    expect(validateVehicleYear('2009', now)).toBeDefined();
    expect(validateVehicleYear('2026', now)).toBeUndefined();
    expect(validateVehicleYear('2027', now)).toBeUndefined();
    expect(validateVehicleYear('2028', now)).toBeDefined();
  });

  it('2025 → minYear 2010', () => {
    const now = new Date('2025-01-01T12:00:00.000Z');
    expect(getVehicleYearBounds(now).minYear).toBe(2010);
    expect(validateVehicleYear('2010', now)).toBeUndefined();
    expect(validateVehicleYear('2009', now)).toBeDefined();
  });

  it('2030 → minYear 2015', () => {
    const now = new Date('2030-07-15T12:00:00.000Z');
    expect(getVehicleYearBounds(now).minYear).toBe(2015);
    expect(validateVehicleYear('2014', now)).toBeDefined();
    expect(validateVehicleYear('2015', now)).toBeUndefined();
  });

  it('empty year is not a field error (required handled elsewhere)', () => {
    expect(validateVehicleYear('')).toBeUndefined();
    expect(validateVehicleYear('   ')).toBeUndefined();
  });
});

describe('vehicleType mapping', () => {
  it('maps UI labels to API slugs', () => {
    expect(vehicleTypeToApi('Auto')).toBe('car');
    expect(vehicleTypeToApi('Moto')).toBe('motorcycle');
    expect(vehicleTypeToApi('Camioneta')).toBe('pickup');
  });

  it('maps API slugs (and legacy UI) back to UI labels', () => {
    expect(vehicleTypeFromApi('car')).toBe('Auto');
    expect(vehicleTypeFromApi('motorcycle')).toBe('Moto');
    expect(vehicleTypeFromApi('pickup')).toBe('Camioneta');
    expect(vehicleTypeFromApi('Auto')).toBe('Auto');
  });
});

describe('vehicleFormFromProfile', () => {
  it('returns null when vehicle is missing or incomplete', () => {
    expect(vehicleFormFromProfile(null)).toBeNull();
    expect(vehicleFormFromProfile({ plate: 'ABC123' })).toBeNull();
    expect(
      vehicleFormFromProfile({
        plate: '',
        brand: 'Toyota',
        model: 'Corolla',
        color: 'Blanco',
        year: 2022,
      }),
    ).toBeNull();
  });

  it('prefills a complete vehicle so the user does not re-type', () => {
    const form = vehicleFormFromProfile({
      plate: 'ab 123 cd',
      brand: ' Toyota ',
      model: 'Corolla',
      color: 'Blanco',
      year: 2022,
      vehicle_type: 'car',
    });
    expect(form).toEqual({
      plate: 'AB123CD',
      brand: 'Toyota',
      model: 'Corolla',
      color: 'Blanco',
      year: '2022',
      type: 'Auto',
    });
    expect(hasCompleteVehicle(form!)).toBe(true);
  });
});
