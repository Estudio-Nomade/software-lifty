import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QuickChips } from '../../components/QuickChips';
import { SEED_FAVORITES, useFavoritesStore } from '../../store/favoritesStore';

jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: () => ({ suggestions: [], loading: false, error: null }),
}));

describe('QuickChips', () => {
  beforeEach(() => {
    useFavoritesStore.setState({ favorites: SEED_FAVORITES.map((f) => ({ ...f })) });
  });

  test('renders Casa, Trabajo and Agregar chips', async () => {
    const { getByText } = await render(<QuickChips onSelect={jest.fn()} />);
    expect(getByText('Casa')).toBeTruthy();
    expect(getByText('Trabajo')).toBeTruthy();
    expect(getByText('Agregar')).toBeTruthy();
  });

  test('tapping a saved favorite calls onSelect with its address', async () => {
    useFavoritesStore.getState().updateFavorite('casa', 'Casa', 'Cabildo 200', -34.5, -58.4);
    const onSelect = jest.fn();
    const { getByText } = await render(<QuickChips onSelect={onSelect} />);
    fireEvent.press(getByText('Casa'));
    expect(onSelect).toHaveBeenCalledWith({
      address: 'Cabildo 200',
      lat: -34.5,
      lng: -58.4,
    });
  });

  test('tapping Casa without an address opens the editor', async () => {
    const { getByText } = await render(<QuickChips onSelect={jest.fn()} />);
    await fireEvent.press(getByText('Casa'));
    expect(getByText('Nuevo favorito')).toBeTruthy();
    expect(getByText('Agregar a favorito')).toBeTruthy();
  });

  test('filling an empty seed chip updates it instead of duplicating', async () => {
    const { getByText, getByPlaceholderText } = await render(<QuickChips onSelect={jest.fn()} />);
    await fireEvent.press(getByText('Casa'));
    await fireEvent.changeText(getByPlaceholderText('Escribí la dirección'), 'Cabildo 200');
    await fireEvent.press(getByText('Agregar a favorito'));
    const { favorites } = useFavoritesStore.getState();
    expect(favorites).toHaveLength(2);
    expect(favorites[0]).toMatchObject({ id: 'casa', label: 'Casa', address: 'Cabildo 200' });
  });

  test('long-press on saved favorite offers edit/delete', async () => {
    useFavoritesStore.getState().updateFavorite('casa', 'Casa', 'Cabildo 200');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const eliminar = buttons?.find((b) => b?.text === 'Eliminar');
      eliminar?.onPress?.();
    });
    const { getByText } = await render(<QuickChips onSelect={jest.fn()} />);
    fireEvent(getByText('Casa'), 'onLongPress');
    expect(alertSpy).toHaveBeenCalled();
    expect(useFavoritesStore.getState().favorites).toHaveLength(1);
    alertSpy.mockRestore();
  });
});
