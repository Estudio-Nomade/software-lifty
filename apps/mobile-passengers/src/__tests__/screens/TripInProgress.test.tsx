import { render } from '@testing-library/react-native';
import React from 'react';
import { TripInProgressScreen } from '../../screens/TripInProgressScreen';
import { useRideStore } from '../../store/rideStore';

jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

jest.mock('../../api/passenger', () => ({
  getActiveRide: jest.fn().mockResolvedValue(null),
}));

describe('TripInProgressScreen', () => {
  beforeEach(() => {
    useRideStore.setState({ activeTrip: null });
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
});
