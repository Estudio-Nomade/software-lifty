import { SEED_FAVORITES, useFavoritesStore } from '../../store/favoritesStore';

const reset = () =>
  useFavoritesStore.setState({ favorites: SEED_FAVORITES.map((f) => ({ ...f })) });

describe('favoritesStore', () => {
  beforeEach(reset);

  test('seeds with Casa and Trabajo (empty addresses)', () => {
    const { favorites } = useFavoritesStore.getState();
    expect(favorites).toEqual([
      { id: 'casa', label: 'Casa', address: '' },
      { id: 'trabajo', label: 'Trabajo', address: '' },
    ]);
  });

  test('addFavorite appends a new favorite with trimmed fields', () => {
    useFavoritesStore.getState().addFavorite('  Gimnasio  ', '  Av. Corrientes 1234  ');
    const { favorites } = useFavoritesStore.getState();
    expect(favorites).toHaveLength(3);
    expect(favorites[2].label).toBe('Gimnasio');
    expect(favorites[2].address).toBe('Av. Corrientes 1234');
    expect(favorites[2].id).toBeTruthy();
  });

  test('updateFavorite edits label and address by id', () => {
    useFavoritesStore.getState().updateFavorite('casa', 'Hogar', 'Cabildo 200');
    const { favorites } = useFavoritesStore.getState();
    expect(favorites[0]).toEqual({ id: 'casa', label: 'Hogar', address: 'Cabildo 200' });
  });

  test('removeFavorite deletes by id', () => {
    useFavoritesStore.getState().removeFavorite('trabajo');
    const { favorites } = useFavoritesStore.getState();
    expect(favorites).toHaveLength(1);
    expect(favorites[0].id).toBe('casa');
  });
});
