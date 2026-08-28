import {
  hasCompleteVehicle,
  vehicleFormFromProfile,
  vehicleTypeFromApi,
  vehicleTypeToApi,
} from '../../lib/vehicleForm';

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
