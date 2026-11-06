import type { Session, User } from '@supabase/supabase-js';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getFriendlyAuthError } from '../lib/authErrors';
import { unregisterPush } from '../lib/notifications';
import {
  getCurrentOAuthAttempt,
  isOAuthLocalSignOutInFlight,
  resolveSignedOutStoreAction,
} from '../lib/oauthSessionRecovery';
import { invalidatePassengerProfileCompleteCache } from '../lib/passengerProfileGate';
import { resetPostOAuthHandoff } from '../lib/postOAuthHandoff';
import { type SocialProvider, signInWithProvider } from '../lib/socialAuth';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<Session | null>;
  signInWithProvider: (provider: SocialProvider) => Promise<Session | null>;
  sendEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, code: string) => Promise<Session | null>;
  resendEmailOtp: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export { getFriendlyAuthError };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function googleDisplayName(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const full = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  if (full) return full;
  const name = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  if (name) return name;
  const given = typeof metadata.given_name === 'string' ? metadata.given_name.trim() : '';
  const family = typeof metadata.family_name === 'string' ? metadata.family_name.trim() : '';
  const joined = [given, family].filter(Boolean).join(' ').trim();
  return joined || null;
}

function syncStore(session: Session | null) {
  const store = useAuthStore.getState();
  if (session?.access_token) {
    const metadata = session.user?.user_metadata as Record<string, unknown> | undefined;
    store.setSession(
      session.access_token,
      session.user?.id ?? null,
      session.user?.email ?? null,
      googleDisplayName(metadata),
    );
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const finishLoading = () => {
      if (mounted) setLoading(false);
    };
    const timeoutId = setTimeout(finishLoading, 8_000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        syncStore(data.session);
        finishLoading();
      })
      .catch((err) => {
        console.log('[AuthProvider] getSession ERROR:', err?.message ?? err);
        finishLoading();
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.access_token) {
        syncStore(nextSession);
        return;
      }
      if (event !== 'SIGNED_OUT') return;

      const attempt = getCurrentOAuthAttempt();
      const localPrep = isOAuthLocalSignOutInFlight();
      if (__DEV__) {
        console.log('[auth] SIGNED_OUT', {
          attemptId: attempt?.id ?? null,
          blockedUserId: attempt?.blockedUserId ?? null,
          localPrep,
          storeAuth: useAuthStore.getState().isAuthenticated,
          storeEmail: useAuthStore.getState().email,
        });
      }

      // OAuth prep / active attempt: never arm Welcome needsRedirect.
      if (attempt || localPrep) {
        useAuthStore.getState().clearAuthLocal();
        return;
      }

      // Stale SIGNED_OUT after password/Google setSession — verify live session.
      void (async () => {
        const { data } = await supabase.auth.getSession();
        // Re-check after await: OAuth/prep or store may have moved during getSession.
        const store = useAuthStore.getState();
        const action = resolveSignedOutStoreAction({
          oauthAttemptActive: Boolean(getCurrentOAuthAttempt()),
          oauthLocalSignOutInFlight: isOAuthLocalSignOutInFlight(),
          liveSessionExists: Boolean(data.session?.access_token),
          storeHasSession: Boolean(store.token && store.isAuthenticated),
        });
        if (__DEV__) {
          console.log('[auth] SIGNED_OUT action', {
            action,
            liveEmail: data.session?.user?.email ?? null,
            storeEmail: store.email,
          });
        }
        if (action === 'resync' && data.session) {
          setSession(data.session);
          syncStore(data.session);
          return;
        }
        if (action === 'keepStore') {
          return;
        }
        if (action === 'clearAuthLocal') {
          useAuthStore.getState().clearAuthLocal();
          return;
        }
        useAuthStore.getState().clearAuth();
      })();
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // Guest / re-tap Google: drop Zustand identity so a prior account cannot stick
    // while socialAuth clears the local Supabase session for this attempt.
    const store = useAuthStore.getState();
    if (store.token || store.userId || store.isAuthenticated) {
      store.clearAuthLocal();
      invalidatePassengerProfileCompleteCache();
    }
    return signInWithProvider('google');
  }, []);

  const sendEmailOtp = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  }, []);

  const resendEmailOtp = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  }, []);

  const verifyEmailOtp = useCallback(async (email: string, code: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizeEmail(email),
      token: code.trim(),
      type: 'email',
    });
    if (error) throw error;
    return data.session;
  }, []);

  const signOut = useCallback(async () => {
    // Unregister while the JWT is still valid so a shared phone stops receiving
    // this account's pushes.
    resetPostOAuthHandoff();
    await unregisterPush();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAuthenticated: !!session,
      signInWithGoogle,
      signInWithProvider,
      sendEmailOtp,
      verifyEmailOtp,
      resendEmailOtp,
      signOut,
    }),
    [session, loading, signInWithGoogle, sendEmailOtp, verifyEmailOtp, resendEmailOtp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de un <AuthProvider>');
  }
  return ctx;
}
