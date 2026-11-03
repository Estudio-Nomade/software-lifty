/**
 * @jest-environment node
 */
import { Platform } from 'react-native';

const mockRequestFg = jest.fn();
const mockRequestBg = jest.fn();
const mockGetBg = jest.fn();
const mockWatch = jest.fn();
const mockHasStarted = jest.fn();
const mockStartUpdates = jest.fn();
const mockStopUpdates = jest.fn();
const mockIsTaskDefined = jest.fn(() => false);
const mockDefineTask = jest.fn();

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestFg(...args),
  requestBackgroundPermissionsAsync: (...args: unknown[]) => mockRequestBg(...args),
  getBackgroundPermissionsAsync: (...args: unknown[]) => mockGetBg(...args),
  getForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: (...args: unknown[]) => mockWatch(...args),
  getCurrentPositionAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: (...args: unknown[]) => mockHasStarted(...args),
  startLocationUpdatesAsync: (...args: unknown[]) => mockStartUpdates(...args),
  stopLocationUpdatesAsync: (...args: unknown[]) => mockStopUpdates(...args),
  Accuracy: { High: 4, Balanced: 3 },
}));

jest.mock('expo-task-manager', () => ({
  isTaskDefined: (...args: unknown[]) => mockIsTaskDefined(...args),
  defineTask: (...args: unknown[]) => mockDefineTask(...args),
}));

jest.mock('../../api/client', () => ({
  apiClient: { put: jest.fn(() => Promise.resolve({ data: {} })) },
}));

import {
  buildBackgroundLocationOptions,
  shouldStartBackgroundUpdates,
  startTracking,
  stopTracking,
} from '../../lib/location';
import { useLocationStore } from '../../store/locationStore';

describe('driver background location tracking', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    useLocationStore.setState({
      lat: null,
      lng: null,
      heading: null,
      locationError: null,
    });
    // @ts-expect-error test override
    Platform.OS = 'android';
    mockRequestFg.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
    mockGetBg.mockResolvedValue({ granted: false, canAskAgain: true, status: 'denied' });
    mockRequestBg.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
    mockHasStarted.mockResolvedValue(false);
    mockStartUpdates.mockResolvedValue(undefined);
    mockStopUpdates.mockResolvedValue(undefined);
    mockWatch.mockResolvedValue({ remove: jest.fn() });
  });

  afterEach(async () => {
    await stopTracking();
    // @ts-expect-error restore
    Platform.OS = originalOS;
  });

  it('shouldStartBackgroundUpdates only when enableBackground and not web', () => {
    expect(shouldStartBackgroundUpdates({ enableBackground: true }, false)).toBe(true);
    expect(shouldStartBackgroundUpdates({ enableBackground: true }, true)).toBe(false);
    expect(shouldStartBackgroundUpdates({ enableBackground: false }, false)).toBe(false);
    expect(shouldStartBackgroundUpdates(undefined, false)).toBe(false);
  });

  it('buildBackgroundLocationOptions uses balanced interval + FGS copy', () => {
    const opts = buildBackgroundLocationOptions(3);
    expect(opts.accuracy).toBe(3);
    expect(opts.timeInterval).toBe(60_000);
    expect(opts.distanceInterval).toBe(50);
    expect(opts.foregroundService.notificationTitle).toContain('Lifty');
  });

  it('startTracking({ enableBackground: true }) starts location updates task', async () => {
    await startTracking({ enableBackground: true });

    expect(mockRequestFg).toHaveBeenCalled();
    expect(mockRequestBg).toHaveBeenCalled();
    expect(mockStartUpdates).toHaveBeenCalledWith(
      'lifty-location',
      expect.objectContaining({
        timeInterval: 60_000,
        foregroundService: expect.objectContaining({
          notificationTitle: 'Lifty — en línea',
        }),
      }),
    );
    expect(mockWatch).not.toHaveBeenCalled();
  });

  it('startTracking without background uses watchPosition only', async () => {
    await startTracking();

    expect(mockStartUpdates).not.toHaveBeenCalled();
    expect(mockWatch).toHaveBeenCalled();
  });

  it('startTracking falls back to watch when bg permission denied', async () => {
    mockRequestBg.mockResolvedValue({ granted: false, canAskAgain: true, status: 'denied' });

    await startTracking({ enableBackground: true });

    expect(mockStartUpdates).not.toHaveBeenCalled();
    expect(mockWatch).toHaveBeenCalled();
  });

  it('stopTracking stops background updates', async () => {
    mockHasStarted.mockResolvedValue(true);
    await startTracking({ enableBackground: true });
    await stopTracking();

    expect(mockStopUpdates).toHaveBeenCalledWith('lifty-location');
  });

  it('serializes rapid start then stop without leaving updates running', async () => {
    let releaseStart: (() => void) | undefined;
    mockStartUpdates.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseStart = resolve;
        }),
    );
    mockHasStarted.mockResolvedValue(true);

    const startP = startTracking({ enableBackground: true });
    const stopP = stopTracking();

    // Let the exclusive queue reach startLocationUpdatesAsync, then finish it.
    await Promise.resolve();
    await Promise.resolve();
    releaseStart?.();

    await Promise.all([startP, stopP]);

    expect(mockStopUpdates).toHaveBeenCalledWith('lifty-location');
  });
});
