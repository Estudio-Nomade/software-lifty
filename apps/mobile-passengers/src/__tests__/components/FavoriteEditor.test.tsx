import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { FavoriteEditor } from '../../components/FavoriteEditor';

jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: () => [],
}));

describe('FavoriteEditor', () => {
  test('shows "Agregar a favorito" in add mode', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = await render(<FavoriteEditor onSave={onSave} onCancel={onCancel} />);
    expect(getByText('Agregar a favorito')).toBeTruthy();
  });

  test('shows "Guardar cambios" when editing a saved favorite', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = await render(
      <FavoriteEditor
        initial={{ label: 'Casa', address: 'Cabildo 200' }}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(getByText('Guardar cambios')).toBeTruthy();
  });

  test('does not save when fields are empty', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = await render(<FavoriteEditor onSave={onSave} onCancel={onCancel} />);
    await fireEvent.press(getByText('Agregar a favorito'));
    expect(onSave).not.toHaveBeenCalled();
  });

  test('saves trimmed label and address when filled', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const { getByPlaceholderText, getByText } = await render(
      <FavoriteEditor onSave={onSave} onCancel={onCancel} />,
    );
    await fireEvent.changeText(getByPlaceholderText('Ej: Casa, Trabajo, Gimnasio'), 'Gimnasio');
    await fireEvent.changeText(getByPlaceholderText('Escribí la dirección'), '  Av. Corrientes  ');
    await fireEvent.press(getByText('Agregar a favorito'));
    expect(onSave).toHaveBeenCalledWith('Gimnasio', 'Av. Corrientes');
  });
});
