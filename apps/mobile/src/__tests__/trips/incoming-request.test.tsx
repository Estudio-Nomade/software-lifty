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
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../lib/location', () => ({ stopTracking: jest.fn() }));

jest.mock('../../components/MapView', () => ({ MapView: () => null }));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { IncomingRequestScreen } from '../../screens/IncomingRequestScreen';
import { useLocationStore } from '../../store/locationStore';
import { useTripStore } from '../../store/tripStore';

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
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockNavigate.mockReset();
    useTripStore.getState().clearTrip();
    useLocationStore.getState().clearLocation();
    mockGet.mockResolvedValue({ data: REAL_TRIP });
    mockPost.mockResolvedValue({ data: { ...REAL_TRIP, status: 'accepted' } });
    mockPut.mockResolvedValue({ data: {} });
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

  test('accept uses the real /accept endpoint with the real trip id', async () => {
    const { getByText } = await render(<IncomingRequestScreen />);
    await waitFor(() => expect(getByText('ACEPTAR')).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByText('ACEPTAR'));
    });
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/trips/trip-real-1/accept');
    });
    expect(mockNavigate).toHaveBeenCalledWith('Navigation');
    expect(useTripStore.getState().tripStatus).toBe('accepted');
    expect(useTripStore.getState().trip).not.toBeNull();
    expect(useTripStore.getState().trip?.id).toBe('trip-real-1');
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
});
