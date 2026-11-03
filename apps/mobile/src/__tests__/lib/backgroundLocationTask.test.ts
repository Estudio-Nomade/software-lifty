/**
 * @jest-environment node
 */

const mockPut = jest.fn(() => Promise.resolve({ data: {} }));

jest.mock('expo-task-manager', () => ({
  isTaskDefined: jest.fn(() => true),
  defineTask: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  apiClient: { put: (...args: unknown[]) => mockPut(...args) },
}));

import { handleBackgroundLocationUpdate } from '../../lib/backgroundLocationTask';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';

describe('handleBackgroundLocationUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLocationStore.setState({
      lat: null,
      lng: null,
      heading: null,
      locationError: null,
    });
    useAuthStore.setState({ token: null, isAuthenticated: false });
  });

  it('skips heartbeat when there is no auth token', async () => {
    await handleBackgroundLocationUpdate([
      {
        coords: {
          latitude: -34.6,
          longitude: -58.4,
          altitude: null,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: 90,
          speed: null,
        },
        timestamp: Date.now(),
      },
    ]);

    expect(mockPut).not.toHaveBeenCalled();
    expect(useLocationStore.getState().lat).toBeNull();
  });

  it('applies coords and heartbeats when token is present', async () => {
    useAuthStore.setState({ token: 'tok', isAuthenticated: true });

    await handleBackgroundLocationUpdate([
      {
        coords: {
          latitude: -34.6,
          longitude: -58.4,
          altitude: null,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: 12,
          speed: null,
        },
        timestamp: Date.now(),
      },
    ]);

    expect(useLocationStore.getState().lat).toBeCloseTo(-34.6);
    expect(mockPut).toHaveBeenCalledWith('/drivers/me/heartbeat', {
      lat: -34.6,
      lng: -58.4,
      heading: 12,
    });
  });
});
