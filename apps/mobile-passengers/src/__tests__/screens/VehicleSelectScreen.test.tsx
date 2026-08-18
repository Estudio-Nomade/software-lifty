import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { estimateFare, requestRide } from '../../api/passenger';
import { VehicleSelectScreen } from '../../screens/VehicleSelectScreen';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../api/passenger', () => ({
  estimateFare: jest.fn(),
  requestRide: jest.fn(),
}));

jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../store/locationStore', () => ({
  useLocationStore: jest.fn(() => null),
}));

jest.mock('../../components/Map/PassengerMap', () => ({
  PassengerMap: () => null,
}));

const mockUseLocalSearchParams = useLocalSearchParams as unknown as jest.Mock;
const mockEstimateFare = estimateFare as unknown as jest.Mock;
const mockRequestRide = requestRide as unknown as jest.Mock;

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const NEAR = {
  pickup: 'Origen A',
  destination: 'Destino B',
  pickupLat: '-34.5',
  pickupLng: '-58.4',
  destLat: '-34.6',
  destLng: '-58.5',
};

const FAR = {
  pickup: 'Origen A',
  destination: 'Destino C',
  pickupLat: '-34.5',
  pickupLng: '-58.4',
  destLat: '-34.9',
  destLng: '-59.0',
};

describe('VehicleSelectScreen fare estimation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue(NEAR);
    mockEstimateFare.mockImplementation(async (p: { vehicle_type: string; dest_lng: number }) => {
      const isFar = p.dest_lng === -59.0;
      if (p.vehicle_type === 'moto') {
        return {
          fare: isFar ? 5200 : 2800,
          distance_km: isFar ? 12.5 : 4.2,
          duration_min: isFar ? 30 : 12,
          vehicle_type: 'moto',
        };
      }
      return {
        fare: isFar ? 7800 : 4200,
        distance_km: isFar ? 12.5 : 4.2,
        duration_min: isFar ? 35 : 15,
        vehicle_type: 'auto',
      };
    });
    mockRequestRide.mockResolvedValue({ id: 'trip-1' });
  });

  test('calls estimateFare with the real coords, not CABA defaults', async () => {
    const { findByText } = await render(<VehicleSelectScreen />);
    await findByText('$4.200');

    expect(mockEstimateFare).toHaveBeenCalledWith({
      origin_lat: -34.5,
      origin_lng: -58.4,
      dest_lat: -34.6,
      dest_lng: -58.5,
      vehicle_type: 'auto',
    });
    expect(mockEstimateFare).toHaveBeenCalledWith({
      origin_lat: -34.5,
      origin_lng: -58.4,
      dest_lat: -34.6,
      dest_lng: -58.5,
      vehicle_type: 'moto',
    });
  });

  test('renders the API price, not the hardcoded $3.500', async () => {
    const { findByText, queryByText } = await render(<VehicleSelectScreen />);
    await findByText('$4.200');

    expect(await findByText('SOLICITAR $4.200')).toBeTruthy();
    expect(queryByText('$3.500')).toBeNull();
    expect(queryByText('$2.100')).toBeNull();
  });

  test('shows a different fare for a farther destination', async () => {
    mockUseLocalSearchParams.mockReturnValue(FAR);

    const { findByText, queryByText } = await render(<VehicleSelectScreen />);
    await findByText('$7.800');

    expect(queryByText('$4.200')).toBeNull();
  });

  test('on API error it never falls back to $3.500 and the CTA does not request', async () => {
    mockEstimateFare.mockRejectedValue(new Error('network down'));

    const { getByText, queryByText } = await render(<VehicleSelectScreen />);
    await act(async () => {});
    await act(async () => {});

    expect(queryByText('$3.500')).toBeNull();
    expect(queryByText('$4.200')).toBeNull();

    await act(async () => {
      fireEvent.press(getByText('SOLICITAR'));
    });

    expect(mockRequestRide).not.toHaveBeenCalled();
  });

  test('SOLICITAR uses distance_km/duration_minutes from the estimate', async () => {
    const { findByText, getByText } = await render(<VehicleSelectScreen />);
    await findByText('$4.200');

    await act(async () => {
      fireEvent.press(getByText('SOLICITAR $4.200'));
    });

    expect(mockRequestRide).toHaveBeenCalledWith({
      origin_lat: -34.5,
      origin_lng: -58.4,
      dest_lat: -34.6,
      dest_lng: -58.5,
      origin_address: 'Origen A',
      dest_address: 'Destino B',
      vehicle_type: 'auto',
      distance_km: 4.2,
      duration_minutes: 15,
    });
  });
});
