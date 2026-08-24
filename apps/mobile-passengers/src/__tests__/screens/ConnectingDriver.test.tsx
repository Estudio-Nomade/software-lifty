import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { ConnectingDriverScreen, SEARCH_TIMEOUT_MS } from '../../screens/ConnectingDriverScreen';
import { useAuthStore } from '../../store/authStore';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ tripId: 'trip-123' }),
}));

jest.mock('../../lib/realtime', () => ({
  subscribeToPassengerChannel: jest.fn(() => () => {}),
}));

const mockReplace = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn(), replace: mockReplace }),
}));

jest.mock('../../api/passenger', () => ({
  getRideDetails: jest.fn().mockResolvedValue(null),
  cancelRide: jest.fn().mockResolvedValue(undefined),
  retryRide: jest.fn().mockResolvedValue({ drivers_found: 0, trip: null }),
}));

describe('ConnectingDriverScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockReplace.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows searching state initially', async () => {
    const { getByText } = await render(<ConnectingDriverScreen />);
    expect(getByText('Conectando con el conductor...')).toBeTruthy();
  });

  test('shows no-driver message after timeout', async () => {
    const { getByText } = await render(<ConnectingDriverScreen />);
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_TIMEOUT_MS);
    });
    expect(getByText('No hay conductores disponibles cerca')).toBeTruthy();
  });

  test('cancel calls cancelRide and replaces to home', async () => {
    const { cancelRide } = require('../../api/passenger');
    const { getByText } = await render(<ConnectingDriverScreen />);
    await act(async () => {
      fireEvent.press(getByText('Cancelar'));
    });
    expect(cancelRide).toHaveBeenCalledWith('trip-123');
    expect(mockReplace).toHaveBeenCalledWith('Home');
  });

  test('stays waiting when trip is only offered', async () => {
    useAuthStore.setState({ userId: 'passenger-1' });
    const { getRideDetails } = require('../../api/passenger');
    const { subscribeToPassengerChannel } = require('../../lib/realtime');
    getRideDetails.mockResolvedValue({ id: 'trip-123', driver_id: 'd-1', status: 'offered' });

    const { getByText } = await render(<ConnectingDriverScreen />);

    const onTripStatus = subscribeToPassengerChannel.mock.calls[0][1];
    await act(async () => {
      await onTripStatus({ id: 'trip-123', driver_id: 'd-1', status: 'offered' });
    });

    expect(mockReplace).not.toHaveBeenCalledWith('TripInProgress');
    expect(getByText('Conectando con el conductor...')).toBeTruthy();
  });

  test('navigates to trip-in-progress when driver accepts', async () => {
    useAuthStore.setState({ userId: 'passenger-1' });
    const { getRideDetails } = require('../../api/passenger');
    const { subscribeToPassengerChannel } = require('../../lib/realtime');
    getRideDetails.mockResolvedValue({ id: 'trip-123', driver_id: 'd-1', status: 'accepted' });

    await render(<ConnectingDriverScreen />);

    const onTripStatus = subscribeToPassengerChannel.mock.calls[0][1];
    await act(async () => {
      await onTripStatus({ id: 'trip-123', driver_id: 'd-1', status: 'accepted' });
    });

    expect(getRideDetails).toHaveBeenCalledWith('trip-123');
    expect(mockReplace).toHaveBeenCalledWith('TripInProgress');
  });

  test('retry calls retryRide and returns to searching state', async () => {
    const { retryRide } = require('../../api/passenger');
    retryRide.mockResolvedValue({ drivers_found: 1, trip: { id: 'trip-123', driver_id: 'd-1' } });

    const { getByText, queryByText } = await render(<ConnectingDriverScreen />);

    await act(async () => {
      jest.advanceTimersByTime(SEARCH_TIMEOUT_MS);
    });
    expect(getByText('No hay conductores disponibles cerca')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText('Buscar conductor de nuevo'));
    });

    expect(retryRide).toHaveBeenCalledWith('trip-123');
    expect(queryByText('Conectando con el conductor...')).toBeTruthy();
  });
});
