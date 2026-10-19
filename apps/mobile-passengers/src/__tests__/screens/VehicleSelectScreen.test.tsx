import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { estimateFare, getDirections, requestRide } from '../../api/passenger';
import { VehicleSelectScreen } from '../../screens/VehicleSelectScreen';

const mockNavigate = jest.fn();
let lastMapProps: Record<string, unknown> | null = null;

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../api/passenger', () => ({
  estimateFare: jest.fn(),
  getDirections: jest.fn(),
  requestRide: jest.fn(),
}));

const mockReplace = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    replace: mockReplace,
  }),
}));

jest.mock('../../store/locationStore', () => ({
  useLocationStore: jest.fn(() => null),
}));

jest.mock('../../store/paymentStore', () => ({
  usePaymentStore: (sel: (s: unknown) => unknown) =>
    sel({
      methods: [
        { id: 'cash', type: 'cash', label: 'Efectivo', isDefault: true },
        { id: 'transfer', type: 'transfer', label: 'Transferencia', isDefault: false },
      ],
      setDefault: jest.fn(),
    }),
}));

jest.mock('../../components/Map/PassengerMap', () => ({
  PassengerMap: (props: Record<string, unknown>) => {
    lastMapProps = props;
    return null;
  },
}));

const mockUseLocalSearchParams = useLocalSearchParams as unknown as jest.Mock;
const mockEstimateFare = estimateFare as unknown as jest.Mock;
const mockGetDirections = getDirections as unknown as jest.Mock;
const mockRequestRide = requestRide as unknown as jest.Mock;

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

/** Encoded polyline for two points roughly matching NEAR coords (lng,lat order after decode). */
const SHORT_POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

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
    lastMapProps = null;
    mockUseLocalSearchParams.mockReturnValue(NEAR);
    mockRequestRide.mockResolvedValue({ id: 'trip-1' });
    mockGetDirections.mockResolvedValue({
      distance_km: 4.2,
      duration_minutes: 14,
      polyline: SHORT_POLYLINE,
    });
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

  test('calls getDirections with the same trip coords', async () => {
    const { findByText } = await render(<VehicleSelectScreen />);
    await findByText('$4.200');

    expect(mockGetDirections).toHaveBeenCalledWith({
      origin_lat: -34.5,
      origin_lng: -58.4,
      dest_lat: -34.6,
      dest_lng: -58.5,
    });
  });

  test('shows route km and min chip from directions', async () => {
    const { findByText } = await render(<VehicleSelectScreen />);
    expect(await findByText(/4[,.]2 km · 14 min/)).toBeTruthy();
  });

  test('passes routeLine and pins to PassengerMap without followUser', async () => {
    const { findByText } = await render(<VehicleSelectScreen />);
    await findByText('$4.200');
    await act(async () => {});

    expect(lastMapProps).toBeTruthy();
    expect(lastMapProps?.followUserLocation).toBe(false);
    expect(lastMapProps?.userLocation).toBeNull();
    const line = lastMapProps?.routeLine as Array<[number, number]>;
    expect(Array.isArray(line)).toBe(true);
    expect(line.length).toBeGreaterThanOrEqual(2);
    const markers = lastMapProps?.markers as Array<{ id: string }>;
    expect(markers?.map((m) => m.id).sort()).toEqual(['dest', 'origin']);
  });

  test('renders the API price, not the hardcoded $3.500', async () => {
    const { findByText, queryByText } = await render(<VehicleSelectScreen />);
    await findByText('$4.200');

    expect(await findByText('Continuar · $4.200')).toBeTruthy();
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

  test('shows Efectivo and Transferencia payment options', async () => {
    const { findByText } = await render(<VehicleSelectScreen />);
    expect(await findByText('Forma de pago')).toBeTruthy();
    expect(await findByText('Efectivo')).toBeTruthy();
    expect(await findByText('Transferencia')).toBeTruthy();
  });

  test('shows a different fare for a farther destination', async () => {
    mockUseLocalSearchParams.mockReturnValue(FAR);
    mockGetDirections.mockResolvedValue({
      distance_km: 12.5,
      duration_minutes: 32,
      polyline: SHORT_POLYLINE,
    });

    const { findByText, queryByText } = await render(<VehicleSelectScreen />);
    await findByText('$7.800');

    expect(queryByText('$4.200')).toBeNull();
  });

  test('on API error it never falls back to $3.500 and the CTA does not navigate', async () => {
    mockEstimateFare.mockRejectedValue(new Error('network down'));
    mockGetDirections.mockRejectedValue(new Error('directions down'));

    const { getByText, queryByText } = await render(<VehicleSelectScreen />);
    await act(async () => {});
    await act(async () => {});

    expect(queryByText('$3.500')).toBeNull();
    expect(queryByText('$4.200')).toBeNull();

    await act(async () => {
      fireEvent.press(getByText('Continuar'));
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('Railway Application not found → one API-down alert, not fare-only copy', async () => {
    const railway404 = {
      code: 'ERR_BAD_REQUEST',
      response: {
        status: 404,
        data: { status: 'error', code: 404, message: 'Application not found' },
      },
      message: 'Request failed with status code 404',
    };
    mockEstimateFare.mockRejectedValue(railway404);
    mockGetDirections.mockRejectedValue(railway404);

    await render(<VehicleSelectScreen />);
    await act(async () => {});
    await act(async () => {});

    expect(Alert.alert).toHaveBeenCalledWith(
      'El servidor Lifty no responde',
      expect.stringMatching(/API no está disponible/i),
    );
    const fareOnlyCalls = (Alert.alert as jest.Mock).mock.calls.filter(
      (c) => c[0] === 'No pudimos calcular la tarifa',
    );
    expect(fareOnlyCalls).toHaveLength(0);
    // One alert total (not 3× auto+moto+directions)
    expect((Alert.alert as jest.Mock).mock.calls.length).toBe(1);
  });

  test('business fare failure (API up) still uses tarifa copy', async () => {
    mockEstimateFare.mockRejectedValue({
      response: { status: 500, data: { error: { message: 'fare matrix failed' } } },
    });
    mockGetDirections.mockResolvedValue({
      distance_km: 4.2,
      duration_minutes: 14,
      polyline: SHORT_POLYLINE,
    });

    await render(<VehicleSelectScreen />);
    await act(async () => {});
    await act(async () => {});

    expect(Alert.alert).toHaveBeenCalledWith(
      'No pudimos calcular la tarifa',
      'Reintentá más tarde.',
    );
  });

  test('directions fail still shows fares when estimate OK', async () => {
    mockGetDirections.mockRejectedValue(new Error('directions down'));

    const { findByText, getAllByText, queryByText } = await render(<VehicleSelectScreen />);
    await findByText('$4.200');
    // Fallback metrics from fare when directions fail (chip + card km).
    expect(getAllByText(/4[,.]2\s*km/).length).toBeGreaterThan(0);
    expect(queryByText('No pudimos trazar la ruta')).toBeNull();
  });

  test('Continuar requests ride with selected payment and goes to ConnectingDriver', async () => {
    const { findByText, getByText } = await render(<VehicleSelectScreen />);
    await findByText('$4.200');

    await act(async () => {
      fireEvent.press(getByText('Continuar · $4.200'));
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
      payment_method: 'cash',
    });
    expect(mockReplace).toHaveBeenCalledWith('ConnectingDriver', { tripId: 'trip-1' });
    expect(mockNavigate).not.toHaveBeenCalledWith('ConfirmPayment', expect.anything());
  });

  test('shows blocked card when suspended for cancellations', async () => {
    mockRequestRide.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            code: 'PASSENGER_SUSPENDED',
            message: 'Estás suspendido temporalmente por cancelaciones.',
          },
        },
      },
    });
    const { findByText, getByText } = await render(<VehicleSelectScreen />);
    await findByText('$4.200');

    await act(async () => {
      fireEvent.press(getByText('Continuar · $4.200'));
    });

    expect(await findByText('Cuenta suspendida temporalmente')).toBeTruthy();
    expect(await findByText(/suspendido temporalmente/i)).toBeTruthy();
    expect(await findByText('Contactar soporte')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
