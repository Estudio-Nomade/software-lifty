import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { resetHomeOutOfServiceBannerSession } from '../lib/homeOutOfServiceBannerSession';
import { invalidatePassengerProfileCompleteCache } from '../lib/passengerProfileGate';

interface AuthState {
  token: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  needsRedirect: boolean;
  sessionRestored: boolean;
  email: string | null;
  fullName: string | null;
  /** Current TyC+privacy versions accepted (server hydrate + local after POST). */
  termsAccepted: boolean;
  setTermsAccepted: (accepted: boolean) => void;
  setSession: (
    token: string | null,
    userId?: string | null,
    email?: string | null,
    fullName?: string | null,
  ) => void;
  clearAuth: () => void;
  /** Drop local identity without arming Welcome redirect (OAuth prep). */
  clearAuthLocal: () => void;
  resetRedirect: () => void;
  setSessionRestored: (restored: boolean) => void;
  setFullName: (fullName: string | null) => void;
}

/** Persist rehydrate merge — exported for unit tests. */
export function mergePassengerAuthPersist(persisted: unknown, current: AuthState): AuthState {
  const p = persisted as Partial<AuthState> | undefined;
  // Prefer live identity over stale persist (do not glue old fullName onto new user).
  if (current.token && current.userId) {
    return {
      ...current,
      token: current.token,
      userId: current.userId,
      email: current.email ?? p?.email ?? null,
      fullName: current.fullName ?? p?.fullName ?? null,
      isAuthenticated: true,
    };
  }
  // Cold start / no live session: hydrate from disk, but isAuthenticated
  // must follow token presence (never keep a sticky true from partial p).
  const token = p?.token ?? current.token ?? null;
  const userId = p?.userId ?? current.userId ?? null;
  return {
    ...current,
    token,
    userId,
    email: p?.email ?? current.email ?? null,
    fullName: p?.fullName ?? current.fullName ?? null,
    isAuthenticated: Boolean(token),
  };
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
      termsAccepted: false,
      setTermsAccepted: (termsAccepted) => set({ termsAccepted }),
      setSession: (token, userId, email, fullName) =>
        set((state) => {
          if (!token) {
            if (state.userId) {
              invalidatePassengerProfileCompleteCache();
            }
            return {
              token: null,
              isAuthenticated: false,
              userId: userId !== undefined ? userId : null,
              email: email !== undefined ? email : null,
              fullName: fullName !== undefined ? fullName : null,
              termsAccepted: false,
              needsRedirect: state.needsRedirect,
            };
          }

          const nextUserId = userId !== undefined ? userId : state.userId;
          const identityChanged =
            nextUserId !== state.userId || (email !== undefined && email !== state.email);

          if (identityChanged) {
            invalidatePassengerProfileCompleteCache();
          }

          // Authenticated session: replace identity — never keep previous account
          // fields via `?? state.*` when the new session omits name/email for a tick.
          return {
            token,
            isAuthenticated: true,
            userId: nextUserId ?? null,
            email: email !== undefined ? email : identityChanged ? null : state.email,
            fullName: fullName !== undefined ? fullName : identityChanged ? null : state.fullName,
            // New identity must re-hydrate legal from server.
            termsAccepted: identityChanged ? false : state.termsAccepted,
            needsRedirect: false,
          };
        }),
      clearAuth: () =>
        set((state) => {
          if (state.userId) {
            invalidatePassengerProfileCompleteCache();
          }
          resetHomeOutOfServiceBannerSession();
          return {
            token: null,
            userId: null,
            email: null,
            fullName: null,
            isAuthenticated: false,
            termsAccepted: false,
            // Only bounce to Welcome if we were logged in — keep if already armed
            // (double clearAuth: listener + explicit signOut).
            needsRedirect: state.isAuthenticated || state.needsRedirect,
          };
        }),
      clearAuthLocal: () => {
        invalidatePassengerProfileCompleteCache();
        resetHomeOutOfServiceBannerSession();
        set({
          token: null,
          userId: null,
          email: null,
          fullName: null,
          isAuthenticated: false,
          termsAccepted: false,
          needsRedirect: false,
        });
      },
      resetRedirect: () => set({ needsRedirect: false }),
      setSessionRestored: (sessionRestored) => set({ sessionRestored }),
      setFullName: (fullName) => set({ fullName }),
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
        termsAccepted: state.termsAccepted,
      }),
      merge: mergePassengerAuthPersist,
    },
  ),
);
