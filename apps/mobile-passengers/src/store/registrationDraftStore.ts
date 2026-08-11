import { create } from 'zustand';

interface RegistrationDraftStore {
  fullName: string | null;
  setFullName: (name: string) => void;
  clear: () => void;
}

export const useRegistrationDraftStore = create<RegistrationDraftStore>((set) => ({
  fullName: null,
  setFullName: (fullName) => set({ fullName }),
  clear: () => set({ fullName: null }),
}));
