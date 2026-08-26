import { isValidLatLng, toMapCoordinate } from '../../hooks/useLocation';

describe('toMapCoordinate', () => {
  it('returns [lng, lat] MapLibre/GeoJSON order (not [lat, lng])', () => {
    // Buenos Aires
    const lat = -34.6037;
    const lng = -58.3816;
    expect(toMapCoordinate(lat, lng)).toEqual([lng, lat]);
    expect(toMapCoordinate(lat, lng)[0]).toBe(lng);
    expect(toMapCoordinate(lat, lng)[1]).toBe(lat);
  });

  it('never swaps a northern-hemisphere point into the ocean', () => {
    // New York approx
    const [x, y] = toMapCoordinate(40.7128, -74.006);
    // longitude must be the more-negative number for NYC
    expect(x).toBe(-74.006);
    expect(y).toBe(40.7128);
  });
});

describe('isValidLatLng', () => {
  it('accepts real coordinates', () => {
    expect(isValidLatLng(-34.6037, -58.3816)).toBe(true);
    expect(isValidLatLng(0.1, 0.1)).toBe(true);
  });

  it('rejects null-island and out-of-range', () => {
    expect(isValidLatLng(0, 0)).toBe(false);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, 181)).toBe(false);
    expect(isValidLatLng(Number.NaN, 1)).toBe(false);
  });
});
