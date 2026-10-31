import { isInsidePickupArea, PICKUP_RADIUS_KM, SERVICE_AREA_HUB } from '../../lib/serviceArea';

describe('serviceArea (driver address preview)', () => {
  it('mirrors BE hub near Villa Dolores', () => {
    expect(SERVICE_AREA_HUB.lat).toBeCloseTo(-31.945, 2);
    expect(SERVICE_AREA_HUB.lng).toBeCloseTo(-65.19, 2);
    expect(PICKUP_RADIUS_KM).toBe(8);
  });

  it('treats hub center as inside pickup', () => {
    expect(isInsidePickupArea(SERVICE_AREA_HUB.lat, SERVICE_AREA_HUB.lng)).toBe(true);
  });

  it('treats Córdoba capital as outside pickup', () => {
    expect(isInsidePickupArea(-31.4201, -64.1888)).toBe(false);
  });

  it('rejects non-finite coords', () => {
    expect(isInsidePickupArea(Number.NaN, SERVICE_AREA_HUB.lng)).toBe(false);
  });
});
