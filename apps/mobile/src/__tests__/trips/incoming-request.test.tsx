const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();

jest.mock('../../api/client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({
    navigate: mockNavigate,
    goBack: (...args: unknown[]) => mockGoBack(...args),
    replace: (...args: unknown[]) => mockNavigate(...args),
  }),
}));

jest.mock('../../lib/location', () => ({ stopTracking: jest.fn() }));

jest.mock('../../components/MapView', () => ({ MapView: () => null }));

jest.mock('../../components/feedback/Snackbar', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Snackbar: ({
      visible,
      title,
      message,
    }: {
      visible: boolean;
      title: string;
      message: string;
    }) =>
      visible
        ? React.createElement(
            View,
            { testID: 'accept-retry-snack' },
            React.createElement(Text, null, title),
            React.createElement(Text, null, message),
          )
        : null,
  };
});

jest.mock('../../lib/offerRingtone', () => ({
  startOfferRingtone: jest.fn(() => Promise.resolve()),
  stopOfferRingtone: jest.fn(),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ApiError } from '../../api/types';
import { resetTripCancelNoticeClaim } from '../../lib/cancellation';
import { startOfferRingtone, stopOfferRingtone } from '../../lib/offerRingtone';
import { IncomingRequestScreen } from '../../screens/IncomingRequestScreen';
import { useLocationStore } from '../../store/locationStore';
import { useTripStore } from '../../store/tripStore';

const mockStartOfferRingtone = startOfferRingtone as jest.MockedFunction<
  typeof startOfferRingtone
>;
const mockStopOfferRingtone = stopOfferRingtone as jest.MockedFunction<typeof stopOfferRingtone>;

const REAL_TRIP = {
  id: 'trip-real-1',
  driver_id: 'driver-1',
  passenger_id: 'pax-1',
  status: 'request_received',
  origin_address: 'Origen Real 123',
  origin_lat: -31.4,
  origin_lng: -64.1,
  dest_address: 'Destino Real 456',
  dest_lat: -31.5,
  dest_lng: -64.2,
  distance_km: 5,
  duration_minutes: 12,
  base_fare: 500,
  distance_fare: 1000,
  time_fare: 500,
  total_fare: 2000,
  platform_fee: 400,
  driver_earnings: 1600,
  payment_method: 'cash',
  is_collected: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  passenger_name: 'Juan Pérez',
  passenger_avatar_url: 'https://example.com/avatar.jpg',
  passenger_phone: '+5491112345678',
  passenger_rating: 4.5,
};

const REAL_TRIP_NO_PASSENGER = {
  ...REAL_TRIP,
  passenger_name: null,
  passenger_avatar_url: null,
  passenger_phone: null,
  passenger_rating: null,
};

describe('IncomingRequestScreen', () => {
  beforeEach(() => {
    jest.useRealTimers();
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockNavigate.mockReset();
    mockGoBack.mockReset();
    mockStartOfferRingtone.mockClear();
    mockStopOfferRingtone.mockClear();
    resetTripCancelNoticeClaim();
    useTripStore.getState().clearTrip();
    useLocationStore.getState().clearLocation();
    mockGet.mockResolvedValue({ data: REAL_TRIP });
    mockPost.mockResolvedValue({ data: { ...REAL_TRIP, status: 'accepted' } });
    mockPut.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('fetches the real active trip on mount (no mock id)', async () => {
    await act(async () => {
      render(<IncomingRequestScreen />);
    });
    expect(mockGet).toHaveBeenCalledWith('/trips/active');
  });

  test('shows real trip data, not hardcoded mock values', async () => {
    const { getByText, queryByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('Origen Real 123')).toBeTruthy());
    expect(getByText('Destino Real 456')).toBeTruthy();
    expect(queryByText('Av. San Martin 450')).toBeNull();
    expect(queryByText('Terminal de Omnibus')).toBeNull();
  });

  test('does not render sponsor / auspicio banner', async () => {
    const { queryByText, getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
    expect(queryByText(/Auspiciado/i)).toBeNull();
    expect(queryByText(/sponsor/i)).toBeNull();
  });

  test('starts offer ringtone when an offer trip is loaded', async () => {
    const { getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
    await waitFor(() => expect(mockStartOfferRingtone).toHaveBeenCalled());
  });

  test('accept uses the real /accept endpoint with the real trip id', async () => {
    const { getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByText('ACEPTAR'));
    });
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/trips/trip-real-1/accept');
    });
    expect(mockStopOfferRingtone).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('Navigation');
    expect(useTripStore.getState().tripStatus).toBe('accepted');
    expect(useTripStore.getState().trip).not.toBeNull();
    expect(useTripStore.getState().trip?.id).toBe('trip-real-1');
  });

  test('failed accept retryable re-arms ringtone via effect (not a detached manual start)', async () => {
    mockPost.mockRejectedValueOnce(
      new ApiError({
        error: { code: 'NETWORK_ERROR', message: 'Network Error', status: 0 },
        meta: { timestamp: new Date().toISOString() },
      }),
    );
    const { getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
    const startsBefore = mockStartOfferRingtone.mock.calls.length;

    await act(async () => {
      fireEvent.press(getByText('ACEPTAR'));
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/trips/trip-real-1/accept');
    });
    await waitFor(() => {
      expect(mockStartOfferRingtone.mock.calls.length).toBeGreaterThan(startsBefore);
    });
    expect(mockStopOfferRingtone).toHaveBeenCalled();
    await waitFor(() => expect(getByText('No se pudo aceptar')).toBeTruthy());
    expect(getByText(/Revisá la conexión/i)).toBeTruthy();
  });

  test('retryable accept with stale client offer → unavailable card, no ringtone re-arm', async () => {
    let activeCalls = 0;
    mockGet.mockImplementation((url: string) => {
      if (url === '/trips/active') {
        activeCalls += 1;
        // mount load + optional polls keep offer; reconcile after accept sees gone
        if (activeCalls === 1) return Promise.resolve({ data: REAL_TRIP });
        return Promise.resolve({ data: null });
      }
      if (url === '/trips/trip-real-1') {
        return Promise.resolve({
          data: { ...REAL_TRIP, status: 'accepted', driver_id: 'other' },
        });
      }
      return Promise.resolve({ data: {} });
    });
    mockPost.mockRejectedValueOnce(
      new ApiError({
        error: { code: 'NETWORK_ERROR', message: 'Network Error', status: 0 },
        meta: { timestamp: new Date().toISOString() },
      }),
    );

    const { getByText, queryByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
    const startsBefore = mockStartOfferRingtone.mock.calls.length;

    await act(async () => {
      fireEvent.press(getByText('ACEPTAR'));
    });

    await waitFor(() => expect(getByText('Este viaje ya no está disponible')).toBeTruthy());
    expect(queryByText(/Revisá la conexión/i)).toBeNull();
    expect(mockStartOfferRingtone.mock.calls.length).toBe(startsBefore);
  });

  test('failed accept OFFER_EXPIRED shows ES card and no ringtone re-arm', async () => {
    mockPost.mockRejectedValueOnce(
      new ApiError({
        error: {
          code: 'OFFER_EXPIRED',
          message: 'La oferta de viaje ha expirado',
          status: 400,
        },
        meta: { timestamp: new Date().toISOString() },
      }),
    );
    const { getByText, queryByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
    const startsBefore = mockStartOfferRingtone.mock.calls.length;

    await act(async () => {
      fireEvent.press(getByText('ACEPTAR'));
    });

    await waitFor(() => expect(getByText('La solicitud expiró')).toBeTruthy());
    expect(getByText('Ya no podés aceptar este viaje.')).toBeTruthy();
    expect(getByText('Entendido')).toBeTruthy();
    expect(queryByText('No se pudo aceptar el viaje.')).toBeNull();
    expect(mockStartOfferRingtone.mock.calls.length).toBe(startsBefore);

    await act(async () => {
      fireEvent.press(getByText('Entendido'));
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Active');
    });
    expect(useTripStore.getState().trip).toBeNull();
  });

  test('failed accept CONFLICT shows unavailable card distinct from expired', async () => {
    mockPost.mockRejectedValueOnce(
      new ApiError({
        error: {
          code: 'CONFLICT',
          message: 'Trip already claimed by another driver',
          status: 409,
        },
        meta: { timestamp: new Date().toISOString() },
      }),
    );
    const { getByText, queryByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
    const startsBefore = mockStartOfferRingtone.mock.calls.length;

    await act(async () => {
      fireEvent.press(getByText('ACEPTAR'));
    });

    await waitFor(() => expect(getByText('Este viaje ya no está disponible')).toBeTruthy());
    expect(getByText(/reasignó o ya no está abierta/i)).toBeTruthy();
    expect(queryByText('La solicitud expiró')).toBeNull();
    expect(queryByText(/Trip already claimed/i)).toBeNull();
    expect(mockStartOfferRingtone.mock.calls.length).toBe(startsBefore);

    await act(async () => {
      fireEvent.press(getByText('Entendido'));
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Active');
    });
  });

  test('failed accept session → Entendido goes to Welcome', async () => {
    mockPost.mockRejectedValueOnce(
      new ApiError({
        error: { code: 'TOKEN_REQUIRED', message: 'Token required', status: 401 },
        meta: { timestamp: new Date().toISOString() },
      }),
    );
    const { getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('ACEPTAR'));
    });

    await waitFor(() => expect(getByText('Sesión expirada')).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByText('Entendido'));
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Welcome');
    });
  });

  test('reject uses the real /reject endpoint with the real trip id', async () => {
    const { getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('Rechazar')).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByText('Rechazar'));
    });
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/trips/trip-real-1/reject');
    });
    expect(mockStopOfferRingtone).toHaveBeenCalled();
  });

  test('shows passenger name when passenger data is present', async () => {
    const { getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('Juan Pérez')).toBeTruthy());
  });

  test('shows passenger avatar when avatar_url is provided', async () => {
    const { getByTestId } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByTestId('avatar-image')).toBeTruthy());
  });

  test('shows passenger fallback avatar when avatar_url is null', async () => {
    mockGet.mockResolvedValue({
      data: { ...REAL_TRIP, passenger_avatar_url: null },
    });
    const { getByTestId } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByTestId('avatar-fallback')).toBeTruthy());
  });

  test('hides passenger row when passenger_name is null', async () => {
    mockGet.mockResolvedValue({ data: REAL_TRIP_NO_PASSENGER });
    const { queryByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(queryByText('Origen Real 123')).toBeTruthy());
    expect(queryByText('Juan Pérez')).toBeNull();
  });

  test('shows ETA when location and trip data are available', async () => {
    useLocationStore.getState().setLocation(-31.4, -64.1);
    const { getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('~12 min al pickup')).toBeTruthy());
  });

  test('does not fetch ETA when location is not available', async () => {
    const { queryByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(queryByText('Origen Real 123')).toBeTruthy());
    expect(queryByText(/min al pickup/)).toBeNull();
  });

  test('passenger cancel while offered → TripCancelled, not silent goBack', async () => {
    const cancelled = {
      ...REAL_TRIP,
      status: 'cancelled_early',
      cancel_reason: 'user_cancel',
      cancel_actor: 'passenger',
    };
    let activeCalls = 0;
    let pollCb: (() => void) | null = null;
    const realSetInterval = global.setInterval;
    const intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(((
      fn: TimerHandler,
      ms?: number,
      ...args: unknown[]
    ) => {
      if (ms === 3000 && typeof fn === 'function') {
        pollCb = fn as () => void;
        return 0 as unknown as ReturnType<typeof setInterval>;
      }
      return realSetInterval(fn as TimerHandler, ms as number, ...(args as []));
    }) as typeof setInterval);

    mockGet.mockImplementation((url: string) => {
      if (url === '/trips/active') {
        activeCalls += 1;
        if (activeCalls === 1) return Promise.resolve({ data: REAL_TRIP });
        return Promise.resolve({ data: null });
      }
      if (url === '/trips/trip-real-1') return Promise.resolve({ data: cancelled });
      return Promise.resolve({ data: {} });
    });

    try {
      const { getByText } = await render(<IncomingRequestScreen />);
      await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
      expect(pollCb).toBeTruthy();

      await act(async () => {
        await pollCb?.();
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          'TripCancelled',
          expect.objectContaining({
            cancel_reason: 'user_cancel',
            trip_id: 'trip-real-1',
          }),
        );
      });
      expect(mockGoBack).not.toHaveBeenCalled();
      expect(mockGet).toHaveBeenCalledWith('/trips/trip-real-1');
    } finally {
      intervalSpy.mockRestore();
    }
  });

  test('poll offer gone (not cancel) shows unavailable card before Active', async () => {
    let activeCalls = 0;
    let pollCb: (() => void) | null = null;
    const realSetInterval = global.setInterval;
    const intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(((
      fn: TimerHandler,
      ms?: number,
      ...args: unknown[]
    ) => {
      if (ms === 3000 && typeof fn === 'function') {
        pollCb = fn as () => void;
        return 0 as unknown as ReturnType<typeof setInterval>;
      }
      return realSetInterval(fn as TimerHandler, ms as number, ...(args as []));
    }) as typeof setInterval);

    mockGet.mockImplementation((url: string) => {
      if (url === '/trips/active') {
        activeCalls += 1;
        if (activeCalls === 1) return Promise.resolve({ data: REAL_TRIP });
        return Promise.resolve({ data: null });
      }
      if (url === '/trips/trip-real-1') {
        return Promise.resolve({
          data: { ...REAL_TRIP, status: 'accepted', driver_id: 'other' },
        });
      }
      return Promise.resolve({ data: {} });
    });

    try {
      const { getByText } = await render(<IncomingRequestScreen />);
      await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
      expect(pollCb).toBeTruthy();

      await act(async () => {
        await pollCb?.();
      });

      await waitFor(() => expect(getByText('Este viaje ya no está disponible')).toBeTruthy());
      expect(mockGoBack).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalledWith('TripCancelled', expect.anything());

      await act(async () => {
        fireEvent.press(getByText('Entendido'));
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('Active');
      });
    } finally {
      intervalSpy.mockRestore();
    }
  });
});

