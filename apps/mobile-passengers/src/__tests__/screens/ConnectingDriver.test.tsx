import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import {
  ConnectingDriverScreen,
  POLL_INTERVAL_MS,
  SEARCH_TIMEOUT_MS,
  SILENT_RETRY_INTERVAL_MS,
} from '../../screens/ConnectingDriverScreen';
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
    useAuthStore.setState({ userId: 'passenger-1' });
    const { getRideDetails, retryRide, cancelRide } = require('../../api/passenger');
    getRideDetails.mockReset().mockResolvedValue(null);
    retryRide.mockReset().mockResolvedValue({ drivers_found: 0, trip: null });
    cancelRide.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows searching state initially', async () => {
    const { getByText } = await render(<ConnectingDriverScreen />);
    expect(getByText('Buscando conductor')).toBeTruthy();
    expect(getByText('Buscando conductores cercanos…')).toBeTruthy();
    expect(getByText('2:00')).toBeTruthy();
  });

  test('keeps searching when realtime reports drivers_found 0 while pending', async () => {
    const { subscribeToPassengerChannel } = require('../../lib/realtime');
    const { getByText, queryByText } = await render(<ConnectingDriverScreen />);

    const onTripStatus = subscribeToPassengerChannel.mock.calls[0][1];
    await act(async () => {
      await onTripStatus({
        id: 'trip-123',
        status: 'pending',
        drivers_found: 0,
        reason: 'NO_NEARBY_DRIVERS',
      });
    });

    expect(getByText('Buscando conductor')).toBeTruthy();
    expect(queryByText('Sin conductores disponibles')).toBeNull();
  });

  test('shows empty after search timeout without accept', async () => {
    const { getByText } = await render(<ConnectingDriverScreen />);
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_TIMEOUT_MS);
    });
    expect(getByText('Sin conductores disponibles')).toBeTruthy();
    expect(
      getByText('No hay conductores cerca por ahora. Podés volver a buscar o cancelar.'),
    ).toBeTruthy();
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
    const { getRideDetails } = require('../../api/passenger');
    const { subscribeToPassengerChannel } = require('../../lib/realtime');
    getRideDetails.mockResolvedValue({ id: 'trip-123', driver_id: 'd-1', status: 'offered' });

    const { getByText } = await render(<ConnectingDriverScreen />);

    const onTripStatus = subscribeToPassengerChannel.mock.calls[0][1];
    await act(async () => {
      await onTripStatus({ id: 'trip-123', driver_id: 'd-1', status: 'offered' });
    });

    expect(mockReplace).not.toHaveBeenCalledWith('TripInProgress');
    expect(getByText('Buscando conductor')).toBeTruthy();
  });

  test('navigates to trip-in-progress when driver accepts', async () => {
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

  test('poll navigates when getRideDetails becomes accepted', async () => {
    const { getRideDetails } = require('../../api/passenger');
    const accepted = { id: 'trip-123', driver_id: 'd-1', status: 'accepted' };
    getRideDetails
      .mockResolvedValueOnce({ id: 'trip-123', status: 'pending' })
      .mockResolvedValue(accepted);

    await render(<ConnectingDriverScreen />);

    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith('TripInProgress');
  });

  test('silent retryRide runs during search after early no-drivers', async () => {
    const { retryRide } = require('../../api/passenger');
    const { subscribeToPassengerChannel } = require('../../lib/realtime');
    retryRide.mockResolvedValue({ drivers_found: 0, trip: { id: 'trip-123', status: 'pending' } });

    const { getByText } = await render(<ConnectingDriverScreen />);

    const onTripStatus = subscribeToPassengerChannel.mock.calls[0][1];
    await act(async () => {
      await onTripStatus({
        id: 'trip-123',
        status: 'pending',
        drivers_found: 0,
        reason: 'NO_NEARBY_DRIVERS',
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(SILENT_RETRY_INTERVAL_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(retryRide.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(getByText('Buscando conductor')).toBeTruthy();
  });

  test('retry CTA returns to searching and calls retryRide', async () => {
    const { retryRide } = require('../../api/passenger');
    retryRide.mockResolvedValue({ drivers_found: 0, trip: { id: 'trip-123', status: 'pending' } });

    const { getByText, queryByText } = await render(<ConnectingDriverScreen />);

    await act(async () => {
      jest.advanceTimersByTime(SEARCH_TIMEOUT_MS);
      await Promise.resolve();
    });
    expect(getByText('Sin conductores disponibles')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText('Volver a buscar'));
    });

    expect(retryRide).toHaveBeenCalledWith('trip-123');
    expect(queryByText('Buscando conductor')).toBeTruthy();
  });
});
