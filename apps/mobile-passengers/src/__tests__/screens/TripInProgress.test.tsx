import { act, render } from '@testing-library/react-native';
import React from 'react';
import { TripInProgressScreen } from '../../screens/TripInProgressScreen';
import { useAuthStore } from '../../store/authStore';
import { useRideStore } from '../../store/rideStore';

jest.mock('../../lib/realtime', () => ({
  subscribeToPassengerChannel: jest.fn(() => () => {}),
  subscribeToDriverLocation: jest.fn(() => () => {}),
}));

jest.mock('../../hooks/useLocation', () => ({
  useLocation: () => ({ current: null, permissionGranted: true, locationError: null, refresh: jest.fn() }),
}));

jest.mock('../../hooks/useDriverRoute', () => ({
  useDriverRoute: () => [],
}));

const mockReplace = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn(), replace: mockReplace }),
}));

jest.mock('../../components/Map/PassengerMap', () => ({
  PassengerMap: () => null,
}));

jest.mock('../../api/passenger', () => ({
  getActiveRide: jest.fn().mockResolvedValue(null),
  getProfile: jest.fn().mockResolvedValue({}),
  cancelRide: jest.fn().mockResolvedValue(undefined),
}));

describe('TripInProgressScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRideStore.setState({ activeTrip: null });
    useAuthStore.setState({ userId: null });
  });

  test('renders real driver name and vehicle from the active trip', async () => {
    useRideStore.getState().setActiveTrip({
      id: 'trip-1',
      passenger_id: 'p-1',
      status: 'accepted',
      origin_lat: -34.6,
      origin_lng: -58.38,
      dest_lat: -34.7,
      dest_lng: -58.4,
      driver_name: 'María López',
      driver_rating: 4.9,
      vehicle_brand: 'Toyota',
      vehicle_model: 'Etios',
      vehicle_plate: 'AB 123 CD',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { getByText } = await render(<TripInProgressScreen />);
    expect(getByText('María López')).toBeTruthy();
    expect(getByText('⭐ 4.9')).toBeTruthy();
    expect(getByText('Toyota Etios')).toBeTruthy();
    expect(getByText('AB 123 CD')).toBeTruthy();
  });

  test('shows verification code when the trip has one', async () => {
    useRideStore.getState().setActiveTrip({
      id: 'trip-2',
      passenger_id: 'p-1',
      status: 'waiting',
      origin_lat: -34.6,
      origin_lng: -58.38,
      dest_lat: -34.7,
      dest_lng: -58.4,
      driver_name: 'María López',
      verification_code: '4821',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { getByText } = await render(<TripInProgressScreen />);
    expect(getByText('4821')).toBeTruthy();
    expect(getByText('Código de verificación')).toBeTruthy();
    expect(getByText('El conductor llegó')).toBeTruthy();
  });

  test('hides verification code when missing', async () => {
    useRideStore.getState().setActiveTrip({
      id: 'trip-3',
      passenger_id: 'p-1',
      status: 'accepted',
      origin_lat: -34.6,
      origin_lng: -58.38,
      dest_lat: -34.7,
      dest_lng: -58.4,
      driver_name: 'María López',
      verification_code: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { queryByText } = await render(<TripInProgressScreen />);
    expect(queryByText('Código de verificación')).toBeNull();
  });

  test('shows in-trip status label', async () => {
    useRideStore.getState().setActiveTrip({
      id: 'trip-4',
      passenger_id: 'p-1',
      status: 'in_trip',
      origin_lat: -34.6,
      origin_lng: -58.38,
      dest_lat: -34.7,
      dest_lng: -58.4,
      driver_name: 'María López',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { getByText } = await render(<TripInProgressScreen />);
    expect(getByText('Viaje en curso')).toBeTruthy();
  });

  test('navigates to TripComplete when trip completes', async () => {
    useAuthStore.setState({ userId: 'passenger-1' });
    useRideStore.getState().setActiveTrip({
      id: 'trip-5',
      passenger_id: 'passenger-1',
      status: 'in_trip',
      origin_lat: -34.6,
      origin_lng: -58.38,
      dest_lat: -34.7,
      dest_lng: -58.4,
      driver_name: 'María López',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { subscribeToPassengerChannel } = require('../../lib/realtime');
    await render(<TripInProgressScreen />);

    const onTripStatus = subscribeToPassengerChannel.mock.calls[0][1];
    await act(async () => {
      await onTripStatus({ id: 'trip-5', status: 'completed' });
    });

    expect(mockReplace).toHaveBeenCalledWith('TripComplete');
    expect(useRideStore.getState().activeTrip?.status).toBe('completed');
  });
});
