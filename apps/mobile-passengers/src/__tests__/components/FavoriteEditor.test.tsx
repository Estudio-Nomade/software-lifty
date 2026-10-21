import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { FavoriteEditor } from '../../components/FavoriteEditor';

const mockUsePlaceAutocomplete = jest.fn(() => ({
  suggestions: [] as Array<{
    place_id: string;
    description: string;
    lat: number;
    lng: number;
  }>,
  loading: false,
  error: null as string | null,
}));

jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: (query: string) => mockUsePlaceAutocomplete(query),
}));

describe('FavoriteEditor', () => {
  beforeEach(() => {
    mockUsePlaceAutocomplete.mockImplementation(() => ({
      suggestions: [],
      loading: false,
      error: null,
    }));
  });

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
    expect(onSave).toHaveBeenCalledWith('Gimnasio', 'Av. Corrientes', undefined, undefined);
  });

  test('typing shows suggestions and save keeps lat/lng from pick', async () => {
    mockUsePlaceAutocomplete.mockImplementation((query: string) => ({
      suggestions:
        query.trim().length >= 2
          ? [
              {
                place_id: 'photon:1',
                description: 'Dique La Florida, Villa Dolores',
                lat: -31.95,
                lng: -65.19,
              },
            ]
          : [],
      loading: false,
      error: null,
    }));

    const onSave = jest.fn();
    const onCancel = jest.fn();
    const { getByPlaceholderText, getByText } = await render(
      <FavoriteEditor
        initial={{ label: 'Casa', address: '' }}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    await fireEvent.changeText(getByPlaceholderText('Escribí la dirección'), 'Di');
    const suggestion = getByText('Dique La Florida, Villa Dolores');
    expect(suggestion).toBeTruthy();

    await fireEvent.press(suggestion);
    // After pick, save must pass lat/lng from the suggestion (H5).
    await fireEvent.press(getByText('Agregar a favorito'));
    expect(onSave).toHaveBeenCalledWith(
      'Casa',
      'Dique La Florida, Villa Dolores',
      -31.95,
      -65.19,
    );
    // Hook gated with empty query once coords are set (no re-search thrash).
    expect(mockUsePlaceAutocomplete).toHaveBeenCalledWith('');
  });
});
