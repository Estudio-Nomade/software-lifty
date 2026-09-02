jest.mock('../../api/passenger', () => ({
  reverseGeocode: jest.fn(),
}));

const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();
const mockWatchPositionAsync = jest.fn();

jest.mock('expo-location', () => ({
  Accuracy: {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
  },
  requestForegroundPermissionsAsync: (...args: unknown[]) =>
    mockRequestForegroundPermissionsAsync(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPositionAsync(...args),
  watchPositionAsync: (...args: unknown[]) => mockWatchPositionAsync(...args),
}));

import { isValidLatLng, requestFreshPosition, toMapCoordinate } from '../../hooks/useLocation';
import { useLocationStore } from '../../store/locationStore';
import {
  MAX_LABEL_ACCURACY_M,
  formatStreetLabel,
  resolveAddressLabel,
} from '../../utils/resolveAddressLabel';
import { Platform } from 'react-native';

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

describe('locationStore.applyFix accuracy gate', () => {
  beforeEach(() => {
    useLocationStore.setState({
      current: null,
      permissionGranted: false,
      locationError: null,
    });
  });

  it('accepts the first valid fix even with coarse accuracy', () => {
    const ok = useLocationStore
      .getState()
      .applyFix({ lat: -37.32, lng: -59.13, accuracy: 2500 });
    expect(ok).toBe(true);
    expect(useLocationStore.getState().current).toEqual({
      lat: -37.32,
      lng: -59.13,
      accuracy: 2500,
    });
    expect(useLocationStore.getState().permissionGranted).toBe(true);
    expect(useLocationStore.getState().locationError).toBeNull();
  });

  it('rejects coarser fixes once a better accuracy is known', () => {
    const ok = useLocationStore
      .getState()
      .applyFix({ lat: -37.32, lng: -59.13, accuracy: 20 }, { force: true });
    expect(ok).toBe(true);

    const rejected = useLocationStore
      .getState()
      .applyFix({ lat: -37.3, lng: -59.1, accuracy: 5000 });
    expect(rejected).toBe(false);
    expect(useLocationStore.getState().current?.lat).toBe(-37.32);
  });

  it('accepts a better (tighter) accuracy fix', () => {
    useLocationStore.getState().applyFix({ lat: -37.32, lng: -59.13, accuracy: 80 }, { force: true });
    const ok = useLocationStore
      .getState()
      .applyFix({ lat: -37.321, lng: -59.133, accuracy: 12 });
    expect(ok).toBe(true);
    expect(useLocationStore.getState().current?.accuracy).toBe(12);
  });

  it('stores a recoverable locationError and clears it on good fix', () => {
    useLocationStore.getState().setLocationError('Activá la ubicación para continuar');
    expect(useLocationStore.getState().locationError).toBe('Activá la ubicación para continuar');
    useLocationStore.getState().applyFix({ lat: -34.6, lng: -58.4, accuracy: 30 });
    expect(useLocationStore.getState().locationError).toBeNull();
  });
});

describe('requestFreshPosition (native path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLocationStore.setState({
      current: null,
      permissionGranted: false,
      locationError: null,
    });
  });

  it('falls back to Balanced when BestForNavigation fails', async () => {
    // jest-expo defaults Platform.OS to ios/android (not web) — native path.
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        coords: { latitude: -34.6037, longitude: -58.3816, accuracy: 45 },
      });

    const fix = await requestFreshPosition();

    expect(fix).toEqual({ lat: -34.6037, lng: -58.3816, accuracy: 45 });
    expect(useLocationStore.getState().current?.lat).toBe(-34.6037);
    expect(mockGetCurrentPositionAsync).toHaveBeenCalledTimes(2);
  });

  it('sets locationError when permission is denied', async () => {
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const fix = await requestFreshPosition();

    expect(fix).toBeNull();
    expect(useLocationStore.getState().locationError).toMatch(/ubicación/i);
  });
});

describe('requestFreshPosition (web insecure context)', () => {
  const originalOS = Platform.OS;
  const originalIsSecureContext = (globalThis as { isSecureContext?: boolean }).isSecureContext;
  const originalLocation = (globalThis as { location?: unknown }).location;

  const setWeb = (secure: boolean) => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    (globalThis as { isSecureContext?: boolean }).isSecureContext = secure;
    (globalThis as { location?: unknown }).location = secure
      ? { hostname: 'localhost' }
      : { hostname: '192.168.0.153' };
  };

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    (globalThis as { isSecureContext?: boolean }).isSecureContext = originalIsSecureContext;
    (globalThis as { location?: unknown }).location = originalLocation;
  });

  it('fails fast with an honest secure-context message on LAN IP (no GPS spinner)', async () => {
    useLocationStore.setState({ current: null, permissionGranted: false, locationError: null });
    setWeb(false);

    const fix = await requestFreshPosition();

    expect(fix).toBeNull();
    expect(useLocationStore.getState().current).toBeNull();
    expect(useLocationStore.getState().locationError).toMatch(/bloquea el GPS/i);
    expect(useLocationStore.getState().locationError).toMatch(/localhost:8083/);
  });

  it('does not report secure-context on localhost (secure origin)', async () => {
    useLocationStore.setState({ current: null, permissionGranted: false, locationError: null });
    setWeb(true);

    // No navigator.geolocation in this runtime → generic denied message, not the LAN one.
    const fix = await requestFreshPosition();

    expect(fix).toBeNull();
    expect(useLocationStore.getState().locationError).not.toMatch(/bloquea el GPS/i);
  });
});

describe('formatStreetLabel', () => {
  it('prefers street+number over POI/person name', () => {
    expect(
      formatStreetLabel({
        name: 'Margarita Galfre',
        street: 'San Martín',
        housenumber: '454',
        city: 'Tandil',
        state: 'Buenos Aires',
        country: 'Argentina',
      }),
    ).toBe('San Martín 454, Tandil, Buenos Aires, Argentina');
  });

  it('falls back to name when no street', () => {
    expect(formatStreetLabel({ name: 'Plaza Independencia', city: 'Tandil' })).toBe(
      'Plaza Independencia, Tandil',
    );
  });

  it('treats highway name as the street (Margarita Galfre case)', () => {
    expect(
      formatStreetLabel({
        name: 'Margarita Galfre',
        osm_key: 'highway',
        city: 'Tandil',
        state: 'Buenos Aires',
        country: 'Argentina',
      }),
    ).toBe('Margarita Galfre, Tandil, Buenos Aires, Argentina');
  });
});

describe('resolveAddressLabel accuracy gate', () => {
  it('does not invent a street when accuracy is coarse', async () => {
    const label = await resolveAddressLabel(-37.32, -59.13, {
      accuracy: MAX_LABEL_ACCURACY_M + 50,
    });
    expect(label).toBe('Mi ubicación actual');
  });
});
