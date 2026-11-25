jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: (props: { name?: string; accessibilityLabel?: string }) =>
      React.createElement(Text, {
        accessibilityLabel: props.accessibilityLabel ?? props.name ?? 'icon',
      }),
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { geocodeAddress } from '../../api/passenger';
import { useLocation, requestFreshPosition } from '../../hooks/useLocation';
import { HomeScreen } from '../../screens/HomeScreen';
import { SEED_FAVORITES, useFavoritesStore } from '../../store/favoritesStore';
import { useLocationStore } from '../../store/locationStore';
import { resolveAddressLabel } from '../../utils/resolveAddressLabel';

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

jest.mock('../../hooks/useLocation', () => ({
  useLocation: jest.fn(),
  toMapCoordinate: (lat: number, lng: number) => [lng, lat] as [number, number],
  isValidLatLng: () => true,
  applyBrowserLocation: jest.fn(),
  TARGET_ACCURACY_M: 40,
  // Default: no GPS — individual tests can override when they need a fix.
  requestFreshPosition: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/resolveAddressLabel', () => ({
  resolveAddressLabel: jest.fn().mockResolvedValue('Mi ubicación actual'),
  MAX_LABEL_ACCURACY_M: 100,
}));

const mockUsePlaceAutocomplete = jest.fn((_query: string) => ({
  suggestions: [] as { description: string; place_id: string; lat: number; lng: number }[],
  loading: false,
  error: null as string | null,
}));
jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: (query: string) => mockUsePlaceAutocomplete(query),
}));

jest.mock('../../api/passenger', () => ({
  getActiveRide: jest.fn().mockResolvedValue(null),
  getProfile: jest.fn().mockResolvedValue(null),
  geocodeAddress: jest.fn(),
  reverseGeocode: jest.fn().mockResolvedValue({
    lat: -34.5,
    lng: -58.4,
    formatted_address: 'Av. Corrientes 1234',
  }),
}));

jest.mock('../../components/Map/PassengerMap', () => ({
  PassengerMap: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: mockNavigate, replace: jest.fn() }),
}));

const mockUseLocation = useLocation as unknown as jest.Mock;
const mockGeocodeAddress = geocodeAddress as unknown as jest.Mock;
const mockRequestFresh = requestFreshPosition as unknown as jest.Mock;
const mockResolveLabel = resolveAddressLabel as unknown as jest.Mock;

async function openSearch() {
  const utils = await render(<HomeScreen />);
  await fireEvent.press(utils.getByText('¿A dónde vas?'));
  return utils;
}

describe('HomeScreen address clear', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLocationStore.setState({
      current: null,
      permissionGranted: false,
      locationError: null,
    });
    mockRequestFresh.mockResolvedValue(null);
    mockResolveLabel.mockResolvedValue('Mi ubicación actual');
    mockUseLocation.mockReturnValue({
      current: null,
      locationError: null,
      refresh: jest.fn().mockResolvedValue(null),
    });
  });

  test('shows location error banner and retries on press', async () => {
    const refresh = jest.fn().mockResolvedValue(null);
    mockUseLocation.mockReturnValue({
      current: null,
      locationError: 'No pudimos obtener tu ubicación. Activá el GPS.',
      refresh,
    });

    const utils = await render(<HomeScreen />);

    expect(utils.getByText(/No pudimos obtener tu ubicación/i)).toBeTruthy();
    await fireEvent.press(utils.getByLabelText('Reintentar ubicación'));
    expect(refresh).toHaveBeenCalled();
  });

  test('no clear button when destination is empty', async () => {
    const { queryByLabelText } = await openSearch();

    expect(queryByLabelText('Borrar destino')).toBeNull();
    expect(queryByLabelText('Borrar origen')).toBeNull();
  });

  test('typing destination shows clear button; tap clears it', async () => {
    const { getByPlaceholderText, getByLabelText, queryByLabelText, queryByDisplayValue } =
      await openSearch();

    await fireEvent.changeText(getByPlaceholderText('Hacia'), 'Calle Falsa 123');

    expect(getByLabelText('Borrar destino')).toBeTruthy();

    await fireEvent.press(getByLabelText('Borrar destino'));

    expect(queryByDisplayValue('Calle Falsa 123')).toBeNull();
    expect(queryByLabelText('Borrar destino')).toBeNull();
  });

  test('origin clear button only clears origin', async () => {
    const { getByPlaceholderText, getByLabelText, queryByDisplayValue, getByDisplayValue } =
      await openSearch();

    await fireEvent.changeText(getByPlaceholderText('Desde'), 'Mi casa');
    await fireEvent.changeText(getByPlaceholderText('Hacia'), 'Trabajo');

    expect(getByLabelText('Borrar origen')).toBeTruthy();

    await fireEvent.press(getByLabelText('Borrar origen'));

    expect(queryByDisplayValue('Mi casa')).toBeNull();
    expect(getByDisplayValue('Trabajo')).toBeTruthy();
  });

  test('clearing GPS autofill origen stays empty (no re-fill loop)', async () => {
    mockRequestFresh.mockResolvedValue({ lat: -31.94, lng: -65.19, accuracy: 15 });
    mockResolveLabel.mockResolvedValue('San Martín 100, Villa Dolores');
    mockUseLocation.mockReturnValue({
      current: { lat: -31.94, lng: -65.19, accuracy: 15 },
      locationError: null,
      refresh: jest.fn().mockResolvedValue({ lat: -31.94, lng: -65.19, accuracy: 15 }),
    });

    const { getByLabelText, getByDisplayValue, queryByDisplayValue, queryByText } =
      await openSearch();

    await waitFor(() => {
      expect(getByDisplayValue('San Martín 100, Villa Dolores')).toBeTruthy();
    });

    await fireEvent.press(getByLabelText('Borrar origen'));

    expect(queryByDisplayValue('San Martín 100, Villa Dolores')).toBeNull();
    // Locked GPS label must not show false "no results" empty.
    expect(queryByText(/No encontramos calles ni lugares/i)).toBeNull();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(queryByDisplayValue('San Martín 100, Villa Dolores')).toBeNull();
  });

  test('Usar mi ubicacion actual writes street label into Origen', async () => {
    mockRequestFresh.mockResolvedValue({ lat: -31.94, lng: -65.19, accuracy: 12 });
    mockResolveLabel.mockResolvedValue('Belgrano 50, Villa Dolores');
    mockUseLocation.mockReturnValue({
      current: { lat: -31.94, lng: -65.19, accuracy: 12 },
      locationError: null,
      refresh: jest.fn().mockResolvedValue({ lat: -31.94, lng: -65.19, accuracy: 12 }),
    });

    const { getByPlaceholderText, getByLabelText, getByDisplayValue } = await openSearch();

    await fireEvent.changeText(getByPlaceholderText('Desde'), 'Otra calle 9');
    await fireEvent.press(getByLabelText('Usar mi ubicación actual'));

    await waitFor(() => {
      expect(getByDisplayValue('Belgrano 50, Villa Dolores')).toBeTruthy();
    });
    expect(mockResolveLabel).toHaveBeenCalled();
  });

  test('Usar mi ubicacion awaits fresh and reverse uses fresh coords not stale cache', async () => {
    // Cache = Miguel Cané side (east); fresh = 25 de Mayo centroid.
    const cached = { lat: -31.9454898, lng: -65.1651154, accuracy: 40 };
    const fresh = { lat: -31.9456491, lng: -65.1771662, accuracy: 12 };
    useLocationStore.setState({
      current: cached,
      permissionGranted: true,
      locationError: null,
    });
    let locationState = {
      current: cached as { lat: number; lng: number; accuracy: number } | null,
      locationError: null as string | null,
      refresh: jest.fn().mockResolvedValue(fresh),
    };
    mockUseLocation.mockImplementation(() => locationState);
    // Autofill completes on first fresh call returning cache-side coords.
    mockRequestFresh.mockResolvedValue(cached);
    mockResolveLabel.mockImplementation(async (lat: number, lng: number) => {
      if (Math.abs(lat - fresh.lat) < 1e-6 && Math.abs(lng - fresh.lng) < 1e-6) {
        return '25 de Mayo, Villa Dolores';
      }
      return 'Miguel Cané, Villa Dolores';
    });

    const { getByPlaceholderText, getByLabelText, getByDisplayValue, rerender } =
      await openSearch();

    await waitFor(() => {
      expect(getByDisplayValue('Miguel Cané, Villa Dolores')).toBeTruthy();
    });

    await fireEvent.changeText(getByPlaceholderText('Desde'), 'Otra calle 9');
    mockResolveLabel.mockClear();
    mockRequestFresh.mockClear();
    mockRequestFresh.mockImplementation(async () => {
      locationState = { ...locationState, current: fresh };
      useLocationStore.setState({
        current: fresh,
        permissionGranted: true,
        locationError: null,
      });
      return fresh;
    });
    await fireEvent.press(getByLabelText('Usar mi ubicación actual'));
    rerender(<HomeScreen />);

    await waitFor(() => {
      expect(getByDisplayValue('25 de Mayo, Villa Dolores')).toBeTruthy();
    });
    expect(mockRequestFresh).toHaveBeenCalled();
    expect(mockResolveLabel).toHaveBeenCalledWith(
      fresh.lat,
      fresh.lng,
      expect.objectContaining({ accuracy: fresh.accuracy }),
    );
    // Final label must come from fresh reverse, not a silent cache-only paint.
    const reverseCalls = mockResolveLabel.mock.calls;
    expect(reverseCalls.length).toBeGreaterThan(0);
    expect(
      reverseCalls.some(
        (c) =>
          Math.abs(c[0] - fresh.lat) < 1e-6 && Math.abs(c[1] - fresh.lng) < 1e-6,
      ),
    ).toBe(true);
  });

  test('Usar mi ubicacion does not race autofill (single fresh request)', async () => {
    const cached = { lat: -31.9454898, lng: -65.1651154, accuracy: 40 };
    const fresh = { lat: -31.9456491, lng: -65.1771662, accuracy: 12 };
    useLocationStore.setState({
      current: cached,
      permissionGranted: true,
      locationError: null,
    });
    let locationState = {
      current: cached as { lat: number; lng: number; accuracy: number } | null,
      locationError: null as string | null,
      refresh: jest.fn().mockResolvedValue(fresh),
    };
    mockUseLocation.mockImplementation(() => locationState);
    mockRequestFresh.mockResolvedValue(cached);
    mockResolveLabel.mockImplementation(async (lat: number, lng: number) => {
      if (Math.abs(lat - fresh.lat) < 1e-6 && Math.abs(lng - fresh.lng) < 1e-6) {
        return '25 de Mayo, Villa Dolores';
      }
      return 'Miguel Cané, Villa Dolores';
    });

    const { getByPlaceholderText, getByLabelText, getByDisplayValue } = await openSearch();
    await waitFor(() => {
      expect(getByDisplayValue('Miguel Cané, Villa Dolores')).toBeTruthy();
    });

    await fireEvent.changeText(getByPlaceholderText('Desde'), 'Otra calle 9');
    mockRequestFresh.mockClear();
    mockResolveLabel.mockClear();

    let resolveFresh!: (v: typeof fresh) => void;
    mockRequestFresh.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFresh = (v) => {
            locationState = { ...locationState, current: v };
            useLocationStore.setState({
              current: v,
              permissionGranted: true,
              locationError: null,
            });
            resolve(v);
          };
        }),
    );

    await fireEvent.press(getByLabelText('Usar mi ubicación actual'));

    // While GPS is in flight, autofill must not start a second request.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockRequestFresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFresh(fresh);
    });

    await waitFor(() => {
      expect(getByDisplayValue('25 de Mayo, Villa Dolores')).toBeTruthy();
    });
    expect(mockRequestFresh).toHaveBeenCalledTimes(1);
  });

  test('Usar mi ubicacion shows error when fresh fails (no silent stale label)', async () => {
    const cached = { lat: -31.9454898, lng: -65.1651154, accuracy: 40 };
    useLocationStore.setState({
      current: cached,
      permissionGranted: true,
      locationError: null,
    });
    mockUseLocation.mockReturnValue({
      current: cached,
      locationError: null,
      refresh: jest.fn().mockResolvedValue(null),
    });
    mockRequestFresh.mockResolvedValue(cached);
    mockResolveLabel.mockResolvedValue('Miguel Cané, Villa Dolores');

    const { getByPlaceholderText, getByLabelText, queryByDisplayValue, getByText } =
      await openSearch();

    await waitFor(() => {
      expect(getByPlaceholderText('Desde').props.value).toBe('Miguel Cané, Villa Dolores');
    });

    await fireEvent.changeText(getByPlaceholderText('Desde'), 'Otra calle 9');
    mockResolveLabel.mockClear();
    mockRequestFresh.mockResolvedValue(null);
    await fireEvent.press(getByLabelText('Usar mi ubicación actual'));

    await waitFor(() => {
      expect(getByText(/No pudimos obtener tu ubicación/i)).toBeTruthy();
    });
    expect(queryByDisplayValue('Miguel Cané, Villa Dolores')).toBeNull();
    expect(queryByDisplayValue('Otra calle 9')).toBeNull();
    expect(mockResolveLabel).not.toHaveBeenCalled();
  });

  test('GPS autofill reverse uses awaited fresh coords not only cache', async () => {
    const cached = { lat: -31.9454898, lng: -65.1651154, accuracy: 80 };
    const fresh = { lat: -31.9456491, lng: -65.1771662, accuracy: 15 };
    useLocationStore.setState({
      current: cached,
      permissionGranted: true,
      locationError: null,
    });
    let locationState = {
      current: cached as { lat: number; lng: number; accuracy: number } | null,
      locationError: null as string | null,
      refresh: jest.fn().mockResolvedValue(fresh),
    };
    mockUseLocation.mockImplementation(() => locationState);
    mockRequestFresh.mockImplementation(async () => {
      locationState = { ...locationState, current: fresh };
      useLocationStore.setState({
        current: fresh,
        permissionGranted: true,
        locationError: null,
      });
      return fresh;
    });
    mockResolveLabel.mockImplementation(async (lat: number, lng: number) => {
      if (Math.abs(lat - fresh.lat) < 1e-6 && Math.abs(lng - fresh.lng) < 1e-6) {
        return '25 de Mayo, Villa Dolores';
      }
      return 'Miguel Cané, Villa Dolores';
    });

    const { getByDisplayValue, rerender } = await openSearch();
    rerender(<HomeScreen />);

    await waitFor(() => {
      expect(getByDisplayValue('25 de Mayo, Villa Dolores')).toBeTruthy();
    });
    expect(mockRequestFresh).toHaveBeenCalled();
    expect(
      mockResolveLabel.mock.calls.some(
        (c) =>
          Math.abs(c[0] - fresh.lat) < 1e-6 && Math.abs(c[1] - fresh.lng) < 1e-6,
      ),
    ).toBe(true);
  });

  test('GPS refine re-resolves label when store moves >20m with better fix', async () => {
    const first = { lat: -31.9454898, lng: -65.1651154, accuracy: 40 };
    const second = { lat: -31.9456491, lng: -65.1771662, accuracy: 12 };
    useLocationStore.setState({
      current: first,
      permissionGranted: true,
      locationError: null,
    });

    let locationState = {
      current: first as { lat: number; lng: number; accuracy: number } | null,
      locationError: null as string | null,
      refresh: jest.fn().mockResolvedValue(first),
    };
    mockUseLocation.mockImplementation(() => locationState);
    mockRequestFresh.mockResolvedValue(first);
    mockResolveLabel.mockImplementation(async (lat: number, lng: number) => {
      if (Math.abs(lat - second.lat) < 1e-6 && Math.abs(lng - second.lng) < 1e-6) {
        return '25 de Mayo, Villa Dolores';
      }
      return 'Miguel Cané, Villa Dolores';
    });

    const { getByDisplayValue, rerender } = await openSearch();

    await waitFor(() => {
      expect(getByDisplayValue('Miguel Cané, Villa Dolores')).toBeTruthy();
    });

    await act(async () => {
      locationState = {
        ...locationState,
        current: second,
      };
      useLocationStore.setState({
        current: second,
        permissionGranted: true,
        locationError: null,
      });
      rerender(<HomeScreen />);
    });

    await waitFor(() => {
      expect(getByDisplayValue('25 de Mayo, Villa Dolores')).toBeTruthy();
    });
  });

  test('GPS lock + focus Origen + type 25 unlocks AC with query 25', async () => {
    const gpsLabel = 'Miguel Cané 100, Villa Dolores';
    mockRequestFresh.mockResolvedValue({ lat: -31.94, lng: -65.19, accuracy: 15 });
    mockResolveLabel.mockResolvedValue(gpsLabel);
    mockUseLocation.mockReturnValue({
      current: { lat: -31.94, lng: -65.19, accuracy: 15 },
      locationError: null,
      refresh: jest.fn().mockResolvedValue({ lat: -31.94, lng: -65.19, accuracy: 15 }),
    });

    const { getByLabelText, getByDisplayValue } = await openSearch();

    await waitFor(() => {
      expect(getByDisplayValue(gpsLabel)).toBeTruthy();
    });

    // While locked + dest focused, pickup AC query stays empty.
    expect(mockUsePlaceAutocomplete.mock.calls.some((c) => c[0] === '25')).toBe(false);

    const origen = getByLabelText('Origen');
    await fireEvent(origen, 'focus');
    // Select-all on locked focus so replace typing does not prepend into GPS label.
    expect(origen.props.selection).toEqual({
      start: 0,
      end: gpsLabel.length,
    });
    // Focus alone must NOT unlock: AC must not run on the full GPS label.
    expect(mockUsePlaceAutocomplete.mock.calls.some((c) => c[0] === gpsLabel)).toBe(false);

    await fireEvent.changeText(origen, '25');

    await waitFor(() => {
      expect(mockUsePlaceAutocomplete.mock.calls.some((c) => c[0] === '25')).toBe(true);
    });
    // Still never queried with the old GPS string as AC input.
    expect(mockUsePlaceAutocomplete.mock.calls.some((c) => c[0] === gpsLabel)).toBe(false);
  });
});

describe('HomeScreen destination confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLocationStore.setState({
      current: { lat: -34.5, lng: -58.4, accuracy: 20 },
      permissionGranted: true,
      locationError: null,
    });
    mockRequestFresh.mockResolvedValue(null);
    mockResolveLabel.mockResolvedValue('Mi ubicación actual');
    mockUseLocation.mockReturnValue({
      current: { lat: -34.5, lng: -58.4 },
      locationError: null,
      refresh: jest.fn().mockResolvedValue({ lat: -34.5, lng: -58.4, accuracy: 20 }),
    });
  });

  test('geocodes destination and navigates with its coords', async () => {
    mockGeocodeAddress.mockResolvedValue({
      lat: -34.6,
      lng: -58.5,
      formatted_address: 'Calle Falsa 123',
    });

    const { getByPlaceholderText, getByText } = await openSearch();
    await fireEvent.changeText(getByPlaceholderText('Hacia'), 'Calle Falsa 123');

    await act(async () => {
      fireEvent.press(getByText('Continuar'));
    });

    expect(mockGeocodeAddress).toHaveBeenCalledWith(
      'Calle Falsa 123',
      expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      'VehicleSelect',
      expect.objectContaining({
        destLat: '-34.6',
        destLng: '-58.5',
        pickupLat: '-34.5',
        pickupLng: '-58.4',
      }),
    );
  });

  test('does not navigate when destination geocode fails', async () => {
    mockGeocodeAddress.mockRejectedValue(new Error('not found'));

    const { getByPlaceholderText, getByText } = await openSearch();
    await fireEvent.changeText(getByPlaceholderText('Hacia'), 'Dirección Inexistente');

    await act(async () => {
      fireEvent.press(getByText('Continuar'));
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      getByText('No encontramos esa calle o lugar. Probá otra búsqueda o elegí una sugerencia.'),
    ).toBeTruthy();
  });
});

describe('HomeScreen favorite chip focused field', () => {
  const casaAddress = 'San Martín 450, Villa Dolores';

  beforeEach(() => {
    jest.clearAllMocks();
    useLocationStore.setState({
      current: null,
      permissionGranted: false,
      locationError: null,
    });
    mockRequestFresh.mockResolvedValue(null);
    mockResolveLabel.mockResolvedValue('Mi ubicación actual');
    mockUseLocation.mockReturnValue({
      current: null,
      locationError: null,
      refresh: jest.fn().mockResolvedValue(null),
    });
    useFavoritesStore.setState({
      favorites: SEED_FAVORITES.map((f) => ({ ...f })),
    });
    useFavoritesStore
      .getState()
      .updateFavorite('casa', 'Casa', casaAddress, -31.945, -65.19);
  });

  test('Casa chip fills Origen when pickup is focused', async () => {
    const { getByPlaceholderText, getByText } = await openSearch();

    await fireEvent(getByPlaceholderText('Desde'), 'focus');
    await fireEvent.press(getByText('Casa'));

    expect(getByPlaceholderText('Desde').props.value).toBe(casaAddress);
    expect(getByPlaceholderText('Hacia').props.value ?? '').toBe('');
  });

  test('Casa chip fills Destino when dest is focused', async () => {
    const { getByPlaceholderText, getByText } = await openSearch();

    await fireEvent(getByPlaceholderText('Hacia'), 'focus');
    await fireEvent.press(getByText('Casa'));

    expect(getByPlaceholderText('Hacia').props.value).toBe(casaAddress);
    expect(getByPlaceholderText('Desde').props.value ?? '').not.toBe(casaAddress);
  });
});
