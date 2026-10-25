import {
  MOTO_MIN_ENGINE_CC,
  VEHICLE_MAX_AGE_YEARS,
  VEHICLE_MIN_MODEL_YEAR,
  getVehicleYearBounds,
  hasCompleteVehicle,
  validateVehicleEngineCc,
  validateVehicleYear,
  vehicleFormFromProfile,
  vehicleTypeFromApi,
  vehicleTypeToApi,
} from '../../lib/vehicleForm';

describe('vehicle year policy', () => {
  it('exposes normative constants', () => {
    expect(VEHICLE_MIN_MODEL_YEAR).toBe(2011);
    expect(VEHICLE_MAX_AGE_YEARS).toBe(15);
  });

  it('2026 → minYear 2011; 2010 invalid; 2011 ok', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const { minYear, maxYear } = getVehicleYearBounds(now);
    expect(minYear).toBe(2011);
    expect(maxYear).toBe(2027);
    expect(validateVehicleYear('2010', now)).toMatch(/No podés registrarte/);
    expect(validateVehicleYear('2010', now)).toMatch(/2011/);
    expect(validateVehicleYear('2011', now)).toBeUndefined();
    expect(validateVehicleYear('2009', now)).toMatch(/No podés registrarte/);
    expect(validateVehicleYear('2026', now)).toBeUndefined();
    expect(validateVehicleYear('2027', now)).toBeUndefined();
    expect(validateVehicleYear('2028', now)).toMatch(/mayor a/);
  });

  it('2025 → minYear 2011; 2010 invalid with clear copy', () => {
    const now = new Date('2025-01-01T12:00:00.000Z');
    expect(getVehicleYearBounds(now).minYear).toBe(2011);
    expect(validateVehicleYear('2011', now)).toBeUndefined();
    expect(validateVehicleYear('2010', now)).toMatch(
      /No podés registrarte con un vehículo 2010/,
    );
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
  });

  it('maps API slugs (and legacy) back to UI labels', () => {
    expect(vehicleTypeFromApi('car')).toBe('Auto');
    expect(vehicleTypeFromApi('motorcycle')).toBe('Moto');
    expect(vehicleTypeFromApi('pickup')).toBe('Auto');
    expect(vehicleTypeFromApi('van')).toBe('Auto');
    expect(vehicleTypeFromApi('camioneta')).toBe('Auto');
    expect(vehicleTypeFromApi('Camioneta')).toBe('Auto');
    expect(vehicleTypeFromApi('Auto')).toBe('Auto');
  });
});

describe('vehicle engine_cc policy', () => {
  it('exposes min 150', () => {
    expect(MOTO_MIN_ENGINE_CC).toBe(150);
  });

  it('moto 150 ok; 149 invalid; empty no field error', () => {
    expect(validateVehicleEngineCc('150', 'Moto')).toBeUndefined();
    expect(validateVehicleEngineCc('250', 'Moto')).toBeUndefined();
    expect(validateVehicleEngineCc('149', 'Moto')).toMatch(/150 cc/);
    expect(validateVehicleEngineCc('', 'Moto')).toBeUndefined();
    expect(validateVehicleEngineCc('abc', 'Moto')).toMatch(/cilindrada/);
  });

  it('auto ignores cc field errors', () => {
    expect(validateVehicleEngineCc('50', 'Auto')).toBeUndefined();
    expect(validateVehicleEngineCc('', 'Auto')).toBeUndefined();
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
      engineCc: '',
    });
    expect(hasCompleteVehicle(form!)).toBe(true);
  });

  it('moto without engine_cc is incomplete; with 150 prefills', () => {
    expect(
      hasCompleteVehicle({
        plate: 'MOT123',
        brand: 'Honda',
        model: 'CG',
        color: 'Rojo',
        year: 2022,
        vehicle_type: 'motorcycle',
      }),
    ).toBe(false);
    expect(
      hasCompleteVehicle({
        plate: 'MOT123',
        brand: 'Honda',
        model: 'CG',
        color: 'Rojo',
        year: 2022,
        vehicle_type: 'motorcycle',
        engine_cc: 149,
      }),
    ).toBe(false);

    const form = vehicleFormFromProfile({
      plate: 'mot 123',
      brand: 'Honda',
      model: 'CG',
      color: 'Rojo',
      year: 2022,
      vehicle_type: 'motorcycle',
      engine_cc: 150,
    });
    expect(form).toEqual({
      plate: 'MOT123',
      brand: 'Honda',
      model: 'CG',
      color: 'Rojo',
      year: '2022',
      type: 'Moto',
      engineCc: '150',
    });
  });
});
