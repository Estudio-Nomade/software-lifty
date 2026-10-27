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
}));

jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: () => ({ suggestions: [], loading: false, error: null }),
}));

jest.mock('../../api/passenger', () => ({
  getActiveRide: jest.fn().mockResolvedValue(null),
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
});

describe('HomeScreen destination confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    const { getByPlaceholderText, getByText, getByDisplayValue, queryByDisplayValue } =
      await openSearch();

    await fireEvent(getByPlaceholderText('Desde'), 'focus');
    await fireEvent.press(getByText('Casa'));

    expect(getByDisplayValue(casaAddress)).toBeTruthy();
    expect(queryByDisplayValue(casaAddress)).toBeTruthy();
    // Destino stays empty (chip went to pickup, not dest)
    expect(getByPlaceholderText('Hacia').props.value ?? '').toBe('');
  });

  test('Casa chip fills Destino when dest is focused', async () => {
    const { getByPlaceholderText, getByText, getByDisplayValue } = await openSearch();

    await fireEvent(getByPlaceholderText('Hacia'), 'focus');
    await fireEvent.press(getByText('Casa'));

    expect(getByDisplayValue(casaAddress)).toBeTruthy();
    expect(getByPlaceholderText('Hacia').props.value).toBe(casaAddress);
    expect(getByPlaceholderText('Desde').props.value ?? '').not.toBe(casaAddress);
  });
});
