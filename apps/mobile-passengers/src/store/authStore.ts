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
  /** One-shot Villa Dolores coverage notice after first signup/login on this device. */
  coverageNoticeSeen: boolean;
  setSession: (
    token: string | null,
    userId?: string | null,
    email?: string | null,
    fullName?: string | null,
  ) => void;
  clearAuth: () => void;
  resetRedirect: () => void;
  setSessionRestored: (restored: boolean) => void;
  setFullName: (fullName: string | null) => void;
  setCoverageNoticeSeen: (seen: boolean) => void;
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
      coverageNoticeSeen: false,
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
          fullName: null,
          isAuthenticated: false,
          needsRedirect: true,
          // keep coverageNoticeSeen — device already saw launch footprint
        }),
      resetRedirect: () => set({ needsRedirect: false }),
      setSessionRestored: (sessionRestored) => set({ sessionRestored }),
      setFullName: (fullName) => set({ fullName }),
      setCoverageNoticeSeen: (coverageNoticeSeen) => set({ coverageNoticeSeen }),
    }),
    {
      name: 'lifty-passenger-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        userId: state.userId,
        email: state.email,
        fullName: state.fullName,
        isAuthenticated: state.isAuthenticated,
        coverageNoticeSeen: state.coverageNoticeSeen,
      }),
      merge: (persisted: unknown, current: AuthState) => {
        const p = persisted as Partial<AuthState>;
        return {
          ...current,
          ...p,
          fullName: current.fullName || p?.fullName || null,
          coverageNoticeSeen: Boolean(p?.coverageNoticeSeen ?? current.coverageNoticeSeen),
        };
      },
    },
  ),
);
