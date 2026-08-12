import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QuickChips } from '../../components/QuickChips';
import { SEED_FAVORITES, useFavoritesStore } from '../../store/favoritesStore';

jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: () => [],
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
    useFavoritesStore.getState().updateFavorite('casa', 'Casa', 'Cabildo 200');
    const onSelect = jest.fn();
    const { getByText } = await render(<QuickChips onSelect={onSelect} />);
    fireEvent.press(getByText('Casa'));
    expect(onSelect).toHaveBeenCalledWith('Cabildo 200');
  });

  test('tapping Casa without an address opens the editor', async () => {
    const { getByText } = await render(<QuickChips onSelect={jest.fn()} />);
    await fireEvent.press(getByText('Casa'));
    expect(getByText('Nuevo favorito')).toBeTruthy();
    expect(getByText('Agregar a favorito')).toBeTruthy();
  });

  test('deleting a favorite confirms and removes it', async () => {
    useFavoritesStore.getState().updateFavorite('casa', 'Casa', 'Cabildo 200');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText } = await render(<QuickChips onSelect={jest.fn()} />);
    fireEvent.press(getByLabelText('Eliminar Casa'));
    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2];
    const eliminar = buttons?.find((b) => b?.text === 'Eliminar');
    eliminar?.onPress?.();
    expect(useFavoritesStore.getState().favorites).toHaveLength(1);
    alertSpy.mockRestore();
  });
});
