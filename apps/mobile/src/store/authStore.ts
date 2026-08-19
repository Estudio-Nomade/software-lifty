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
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      driverId: null,
      isAuthenticated: false,
      needsRedirect: false,
      sessionRestored: false,
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
    }),
    {
      name: 'lifty-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        driverId: state.driverId,
        isAuthenticated: state.isAuthenticated,
        driverStatus: state.driverStatus,
        onboardingStep: state.onboardingStep,
        kycSessionId: state.kycSessionId,
        termsAccepted: state.termsAccepted,
      }),
    },
  ),
);
