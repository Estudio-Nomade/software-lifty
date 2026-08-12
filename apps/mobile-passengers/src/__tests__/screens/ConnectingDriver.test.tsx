import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { ConnectingDriverScreen } from '../../screens/ConnectingDriverScreen';
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

  test('shows no-driver message after 30s timeout', async () => {
    const { getByText } = await render(<ConnectingDriverScreen />);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
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

  test('navigates to trip-in-progress when a driver claims the trip', async () => {
    useAuthStore.setState({ userId: 'passenger-1' });
    const { getRideDetails } = require('../../api/passenger');
    const { subscribeToPassengerChannel } = require('../../lib/realtime');
    getRideDetails.mockResolvedValue({ id: 'trip-123', driver_id: 'd-1' });

    await render(<ConnectingDriverScreen />);

    const onTripStatus = subscribeToPassengerChannel.mock.calls[0][1];
    await act(async () => {
      await onTripStatus({ id: 'trip-123', driver_id: 'd-1' });
    });

    expect(getRideDetails).toHaveBeenCalledWith('trip-123');
    expect(mockReplace).toHaveBeenCalledWith('TripInProgress');
  });
});
