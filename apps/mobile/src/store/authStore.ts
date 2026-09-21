import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type DriverStatusValue = 'pending' | 'approved' | 'under_review' | 'rejected' | 'suspended' | null;

interface AuthState {
  token: string | null;
  driverId: string | null;
  isAuthenticated: boolean;
  needsRedirect: boolean;
  sessionRestored: boolean;
  /** True after zustand persist finished reading AsyncStorage (or skipped). */
  hasHydrated: boolean;
  phone: string | null;
  driverStatus: DriverStatusValue;
  onboardingStep: string | null;
  kycSessionId: string | null;
  termsAccepted: boolean;
  setTermsAccepted: (accepted: boolean) => void;
  setSession: (token: string | null, userId?: string | null) => void;
  setDriverId: (driverId: string) => void;
  clearAuth: () => void;
  clearAuthState: () => void;
  resetRedirect: () => void;
  setPhone: (phone: string) => void;
  setDriverStatus: (status: DriverStatusValue) => void;
  setOnboardingStep: (step: string | null) => void;
  setKycSessionId: (sessionId: string | null) => void;
  setSessionRestored: (restored: boolean) => void;
  setHasHydrated: (hydrated: boolean) => void;
}

type PersistedAuthSlice = {
  termsAccepted?: boolean;
  phone?: string | null;
};

function pickPersisted(raw: unknown): PersistedAuthSlice {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  return {
    termsAccepted: typeof o.termsAccepted === 'boolean' ? o.termsAccepted : undefined,
    phone: typeof o.phone === 'string' || o.phone === null ? (o.phone as string | null) : undefined,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      driverId: null,
      isAuthenticated: false,
      needsRedirect: false,
      sessionRestored: false,
      hasHydrated: false,
      phone: null,
      driverStatus: null,
      onboardingStep: null,
      kycSessionId: null,
      termsAccepted: false,
      setSession: (token, userId) =>
        set((state) => ({
          token,
          isAuthenticated: !!token,
          driverId: userId ?? state.driverId,
        })),
      setDriverId: (driverId) => set({ driverId }),
      clearAuth: () =>
        set((state) => ({
          token: null,
          driverId: null,
          isAuthenticated: false,
          needsRedirect: state.isAuthenticated,
          phone: null,
          driverStatus: null,
          onboardingStep: null,
          kycSessionId: null,
          termsAccepted: false,
        })),
      clearAuthState: () =>
        set({
          token: null,
          driverId: null,
          isAuthenticated: false,
          needsRedirect: false,
          phone: null,
          driverStatus: null,
          onboardingStep: null,
          kycSessionId: null,
          termsAccepted: false,
        }),
      resetRedirect: () => set({ needsRedirect: false }),
      setPhone: (phone) => set({ phone }),
      setDriverStatus: (driverStatus) => set({ driverStatus }),
      setOnboardingStep: (onboardingStep) => set({ onboardingStep }),
      setKycSessionId: (kycSessionId) => set({ kycSessionId }),
      setTermsAccepted: (termsAccepted) => set({ termsAccepted }),
      setSessionRestored: (sessionRestored) => set({ sessionRestored }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'lifty-auth',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Only UI prefs — never token/status/step (those race SessionRestore → Paso 1/3).
      partialize: (state) => ({
        termsAccepted: state.termsAccepted,
        phone: state.phone,
      }),
      migrate: (persisted) => pickPersisted(persisted),
      onRehydrateStorage: () => (_state, _error) => {
        // Always unblock SessionRestore (even if persist read fails).
        useAuthStore.getState().setHasHydrated(true);
      },
    },
  ),
);
