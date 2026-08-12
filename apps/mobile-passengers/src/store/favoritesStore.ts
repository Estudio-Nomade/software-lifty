import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface Favorite {
  id: string;
  label: string;
  address: string;
}

interface FavoritesState {
  favorites: Favorite[];
  addFavorite: (label: string, address: string) => void;
  updateFavorite: (id: string, label: string, address: string) => void;
  removeFavorite: (id: string) => void;
}

export const SEED_FAVORITES: Favorite[] = [
  { id: 'casa', label: 'Casa', address: '' },
  { id: 'trabajo', label: 'Trabajo', address: '' },
];

const generateId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      favorites: SEED_FAVORITES,
      addFavorite: (label, address) =>
        set((state) => ({
          favorites: [
            ...state.favorites,
            { id: generateId(), label: label.trim(), address: address.trim() },
          ],
        })),
      updateFavorite: (id, label, address) =>
        set((state) => ({
          favorites: state.favorites.map((f) =>
            f.id === id ? { ...f, label: label.trim(), address: address.trim() } : f,
          ),
        })),
      removeFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.filter((f) => f.id !== id),
        })),
    }),
    {
      name: 'lifty-passenger-favorites',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
