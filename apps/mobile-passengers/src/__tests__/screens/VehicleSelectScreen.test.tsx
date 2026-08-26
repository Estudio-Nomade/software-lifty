import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { estimateFare } from '../../api/passenger';
import { VehicleSelectScreen } from '../../screens/VehicleSelectScreen';

const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../api/passenger', () => ({
  estimateFare: jest.fn(),
  requestRide: jest.fn(),
}));

jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../store/locationStore', () => ({
  useLocationStore: jest.fn(() => null),
}));

jest.mock('../../store/paymentStore', () => ({
  usePaymentStore: (sel: (s: unknown) => unknown) =>
    sel({
      methods: [{ id: 'cash', type: 'cash', label: 'Efectivo', isDefault: true }],
      setDefault: jest.fn(),
    }),
}));

jest.mock('../../components/Map/PassengerMap', () => ({
  PassengerMap: () => null,
}));

const mockUseLocalSearchParams = useLocalSearchParams as unknown as jest.Mock;
const mockEstimateFare = estimateFare as unknown as jest.Mock;

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

    expect(await findByText('CONTINUAR $4.200')).toBeTruthy();
    expect(queryByText('CONTINUO')).toBeNull();
    expect(queryByText('$3.500')).toBeNull();
    expect(queryByText('$2.100')).toBeNull();
  });

  test('shows Hacia destination without mystery markers', async () => {
    const { findByText, getAllByText, queryByText } = await render(<VehicleSelectScreen />);
    expect(await findByText('Hacia')).toBeTruthy();
    expect(getAllByText('Destino B').length).toBeGreaterThan(0);
    expect(queryByText('CONTINUO')).toBeNull();
  });

  test('shows payment method row with Efectivo', async () => {
    const { findByText } = await render(<VehicleSelectScreen />);
    expect(await findByText('Forma de pago')).toBeTruthy();
    expect(await findByText('Efectivo')).toBeTruthy();
  });

  test('shows a different fare for a farther destination', async () => {
    mockUseLocalSearchParams.mockReturnValue(FAR);

    const { findByText, queryByText } = await render(<VehicleSelectScreen />);
    await findByText('$7.800');

    expect(queryByText('$4.200')).toBeNull();
  });

  test('on API error it never falls back to $3.500 and the CTA does not navigate', async () => {
    mockEstimateFare.mockRejectedValue(new Error('network down'));

    const { getByText, queryByText } = await render(<VehicleSelectScreen />);
    await act(async () => {});
    await act(async () => {});

    expect(queryByText('$3.500')).toBeNull();
    expect(queryByText('$4.200')).toBeNull();

    await act(async () => {
      fireEvent.press(getByText('CONTINUAR'));
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('CONTINUAR navigates to ConfirmPayment with estimate params', async () => {
    const { findByText, getByText } = await render(<VehicleSelectScreen />);
    await findByText('$4.200');

    await act(async () => {
      fireEvent.press(getByText('CONTINUAR $4.200'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('ConfirmPayment', {
      pickup: 'Origen A',
      destination: 'Destino B',
      pickupLat: '-34.5',
      pickupLng: '-58.4',
      destLat: '-34.6',
      destLng: '-58.5',
      vehicleType: 'auto',
      fare: '4200',
      distanceKm: '4.2',
      durationMin: '15',
    });
  });
});
