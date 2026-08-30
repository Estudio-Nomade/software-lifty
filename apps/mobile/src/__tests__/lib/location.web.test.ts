/**
 * @jest-environment jsdom
 */
import { Platform } from 'react-native';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  Accuracy: { High: 4, Balanced: 3 },
}));

import {
  getCurrentPosition,
  isWebRuntime,
  startTracking,
  stopTracking,
} from '../../lib/location';
import { useLocationStore } from '../../store/locationStore';

describe('driver location web path', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    useLocationStore.setState({
      lat: null,
      lng: null,
      heading: null,
      locationError: null,
    });
    // @ts-expect-error test override
    Platform.OS = 'web';
  });

  afterEach(async () => {
    await stopTracking();
    // @ts-expect-error restore
    Platform.OS = originalOS;
    // @ts-expect-error cleanup mock geo
    delete globalThis.navigator.geolocation;
  });

  it('isWebRuntime is true only when Platform.OS === web', () => {
    // @ts-expect-error test
    Platform.OS = 'web';
    expect(isWebRuntime()).toBe(true);
    // @ts-expect-error test
    Platform.OS = 'android';
    expect(isWebRuntime()).toBe(false);
    // @ts-expect-error test
    Platform.OS = 'ios';
    expect(isWebRuntime()).toBe(false);
  });

  it('getCurrentPosition fills store from navigator.geolocation on web', async () => {
    const getCurrentPositionMock = jest.fn((success: (pos: unknown) => void) => {
      success({
        coords: { latitude: -34.6, longitude: -58.4, heading: 90 },
      });
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        geolocation: {
          getCurrentPosition: getCurrentPositionMock,
          watchPosition: jest.fn(() => 1),
          clearWatch: jest.fn(),
        },
      },
      configurable: true,
    });

    await getCurrentPosition();

    const state = useLocationStore.getState();
    expect(state.lat).toBeCloseTo(-34.6);
    expect(state.lng).toBeCloseTo(-58.4);
    expect(state.heading).toBe(90);
    expect(state.locationError).toBeNull();
    expect(getCurrentPositionMock).toHaveBeenCalled();
  });

  it('sets locationError when geolocation is missing on web', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    Object.defineProperty(globalThis, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    await getCurrentPosition();

    const state = useLocationStore.getState();
    expect(state.lat).toBeNull();
    expect(state.lng).toBeNull();
    expect(state.locationError).toBeTruthy();
  });

  it('startTracking + stopTracking uses clearWatch on web', async () => {
    const clearWatch = jest.fn();
    const watchPosition = jest.fn((_s, _e, _o) => 42);
    const getCurrent = jest.fn((success: (pos: unknown) => void) => {
      success({ coords: { latitude: -34.5, longitude: -58.5, heading: null } });
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        geolocation: {
          getCurrentPosition: getCurrent,
          watchPosition,
          clearWatch,
        },
      },
      configurable: true,
    });

    await startTracking();
    expect(watchPosition).toHaveBeenCalled();
    expect(useLocationStore.getState().lat).toBeCloseTo(-34.5);

    await stopTracking();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });
});
