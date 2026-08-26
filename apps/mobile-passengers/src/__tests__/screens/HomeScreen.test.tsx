import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { geocodeAddress } from '../../api/passenger';
import { useLocation } from '../../hooks/useLocation';
import { HomeScreen } from '../../screens/HomeScreen';

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
  // Default: no GPS — individual tests can override when they need a fix.
  requestFreshPosition: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: () => [],
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

async function openSearch() {
  const utils = await render(<HomeScreen />);
  await fireEvent.press(utils.getByText('¿A dónde vas?'));
  return utils;
}

describe('HomeScreen address clear', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocation.mockReturnValue({ current: null });
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
});

describe('HomeScreen destination confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocation.mockReturnValue({ current: { lat: -34.5, lng: -58.4 } });
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
      fireEvent.press(getByText('Buscar destino'));
    });

    expect(mockGeocodeAddress).toHaveBeenCalledWith('Calle Falsa 123');
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
      fireEvent.press(getByText('Buscar destino'));
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(getByText('No encontramos esa dirección. Revisá la dirección e intentá de nuevo.')).toBeTruthy();
  });
});
