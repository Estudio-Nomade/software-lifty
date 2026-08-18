import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
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
  useLocation: () => ({ current: null }),
}));

jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: () => [],
}));

jest.mock('../../api/passenger', () => ({
  getActiveRide: jest.fn().mockResolvedValue(null),
  geocodeAddress: jest.fn(),
}));

jest.mock('../../components/Map/PassengerMap', () => ({
  PassengerMap: () => null,
}));

jest.mock('../../hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigate: jest.fn(), replace: jest.fn() }),
}));

async function openSearch() {
  const utils = await render(<HomeScreen />);
  await fireEvent.press(utils.getByText('¿A dónde vas?'));
  return utils;
}

describe('HomeScreen address clear', () => {
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
