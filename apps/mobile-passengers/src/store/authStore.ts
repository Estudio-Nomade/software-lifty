import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  needsRedirect: boolean;
  sessionRestored: boolean;
  email: string | null;
  fullName: string | null;
  setSession: (
    token: string | null,
    userId?: string | null,
    email?: string | null,
    fullName?: string | null,
  ) => void;
  clearAuth: () => void;
  resetRedirect: () => void;
  setSessionRestored: (restored: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      isAuthenticated: false,
      needsRedirect: false,
      sessionRestored: false,
      email: null,
      fullName: null,
      setSession: (token, userId, email, fullName) =>
        set((state) => ({
          token,
          isAuthenticated: !!token,
          userId: userId ?? state.userId,
          email: email ?? state.email,
          fullName: fullName ?? state.fullName,
          needsRedirect: token ? false : state.needsRedirect,
        })),
      clearAuth: () =>
        set({
          token: null,
          userId: null,
          email: null,
          isAuthenticated: false,
          needsRedirect: true,
          sessionRestored: false,
        }),
      resetRedirect: () => set({ needsRedirect: false }),
      setSessionRestored: (sessionRestored) => set({ sessionRestored }),
    }),
    {
      name: 'lifty-passenger-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        userId: state.userId,
        email: state.email,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
