const mockRouterReplace = jest.fn();
let mockNeedsRedirect = false;
let mockIsAuthenticated = false;
let mockSessionRestored = true;
let mockSegments: (string | undefined)[] = [''];
let mockOnboardingStep: string | null = null;
let mockDriverStatus: string | null = null;
let mockTrip: Record<string, unknown> | null = null;
const mockResetRedirect = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: jest.fn(), back: jest.fn() }),
  useSegments: () => mockSegments,
}));

jest.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      needsRedirect: mockNeedsRedirect,
      isAuthenticated: mockIsAuthenticated,
      sessionRestored: mockSessionRestored,
      onboardingStep: mockOnboardingStep,
      driverStatus: mockDriverStatus,
      resetRedirect: mockResetRedirect,
    }),
}));

jest.mock('../../store/tripStore', () => ({
  useTripStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ trip: mockTrip, activeTripId: null, tripStatus: null }),
}));

import { act, render } from '@testing-library/react-native';
import React from 'react';
import { InteractionManager } from 'react-native';
import { AuthRedirectWatcher } from '../../components/AuthRedirectWatcher';

describe('AuthRedirectWatcher', () => {
  beforeEach(() => {
    mockRouterReplace.mockClear();
    mockResetRedirect.mockClear();
    mockNeedsRedirect = false;
    mockIsAuthenticated = false;
    mockSessionRestored = true;
    mockSegments = [''];
    mockOnboardingStep = null;
    mockDriverStatus = null;
    mockTrip = null;
    jest
      .spyOn(InteractionManager, 'runAfterInteractions')
      .mockImplementation((task?: (() => void) | { gen?: () => void }) => {
        if (typeof task === 'function') task();
        return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() } as never;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not redirect when the user is not authenticated', async () => {
    mockIsAuthenticated = false;

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  test('redirects to /online when authenticated on a public route', async () => {
    mockIsAuthenticated = true;
    mockSegments = [''];
    mockDriverStatus = 'approved';
    mockOnboardingStep = 'approved';

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/online');
  });

  test('does not redirect to /online when authenticated on a private route', async () => {
    mockIsAuthenticated = true;
    mockSegments = ['online'];

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).not.toHaveBeenCalledWith('/online');
  });

  test('redirects to /online when approved on a trip route without a live trip', async () => {
    mockIsAuthenticated = true;
    mockDriverStatus = 'approved';
    mockSegments = ['waiting-passenger'];
    mockTrip = null;

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/online');
  });

  test('does not redirect when approved on a trip route with a live trip', async () => {
    mockIsAuthenticated = true;
    mockDriverStatus = 'approved';
    mockSegments = ['waiting-passenger'];
    mockTrip = {
      id: 'trip-1',
      status: 'waiting',
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).not.toHaveBeenCalledWith('/online');
  });

  test('does not redirect after accepting a trip (accepted trip on navigation route)', async () => {
    mockIsAuthenticated = true;
    mockDriverStatus = 'approved';
    mockSegments = ['navigation'];
    mockTrip = {
      id: 'trip-1',
      status: 'accepted',
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).not.toHaveBeenCalledWith('/online');
  });

  test('does not redirect off a trip route when the trip is stale but still active', async () => {
    mockIsAuthenticated = true;
    mockDriverStatus = 'approved';
    mockSegments = ['waiting-passenger'];
    mockTrip = {
      id: 'trip-1',
      status: 'waiting',
      // Stale updated_at (10 minutes ago) — time-based isLiveTrip would reject
      // this, but the driver is legitimately waiting and must stay on screen.
      updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).not.toHaveBeenCalledWith('/online');
  });

  test('does not redirect a non-approved driver off a trip route', async () => {
    mockIsAuthenticated = true;
    mockDriverStatus = 'under_review';
    mockSegments = ['waiting-passenger'];
    mockTrip = null;

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).not.toHaveBeenCalledWith('/online');
  });

  test('redirects to / exactly once when needsRedirect is set', async () => {
    mockNeedsRedirect = true;
    mockSegments = ['profile'];

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/');
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockResetRedirect).toHaveBeenCalledTimes(1);
  });

  test('does not redirect to / when needsRedirect is set on an auth flow route', async () => {
    mockNeedsRedirect = true;
    mockSegments = ['login-credentials'];

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).not.toHaveBeenCalledWith('/');
    expect(mockResetRedirect).toHaveBeenCalledTimes(1);
  });

  test('redirects an authenticated user on / exactly once', async () => {
    mockIsAuthenticated = true;
    mockSegments = [''];
    mockDriverStatus = 'approved';
    mockOnboardingStep = 'approved';

    await act(async () => {
      render(React.createElement(AuthRedirectWatcher));
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/online');
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
  });
});
