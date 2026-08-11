import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface RegistrationDraftStore {
  fullName: string | null;
  setFullName: (name: string) => void;
  clear: () => void;
}

export const useRegistrationDraftStore = create<RegistrationDraftStore>()(
  persist(
    (set) => ({
      fullName: null,
      setFullName: (fullName) => set({ fullName }),
      clear: () => set({ fullName: null }),
    }),
    {
      name: 'lifty-passenger-registration',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
