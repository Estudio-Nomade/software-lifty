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
import { apiClient } from '../api/client';
import { queryClient } from '../lib/queryClient';
import { type SocialProvider, signInWithProvider } from '../lib/socialAuth';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

interface AuthContextValue {
  /** Current Supabase session, or null when signed out. */
  session: Session | null;
  /** Current Supabase user, or null when signed out. */
  user: User | null;
  /** True while the initial session is being restored on app launch. */
  loading: boolean;
  isAuthenticated: boolean;
  /** Opens the Google OAuth flow. Resolves with the session, or null if cancelled. */
  signInWithGoogle: () => Promise<Session | null>;
  /** Generic social sign-in — ready for Apple once the provider is enabled. */
  signInWithProvider: (provider: SocialProvider) => Promise<Session | null>;
  /** Sends a one-time login code to the email (creates the user if new). */
  sendEmailOtp: (email: string) => Promise<void>;
  /** Verifies the emailed code and starts the session. */
  verifyEmailOtp: (email: string, code: string) => Promise<Session | null>;
  /** Re-sends a fresh login code to the email. */
  resendEmailOtp: (email: string) => Promise<void>;
  /** Signs out locally and revokes backend refresh tokens (best-effort). */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Mirror the Supabase session into the Zustand store so the axios client and
// the redirect watcher (which read from the store) stay in sync.
function syncStore(session: Session | null) {
  const store = useAuthStore.getState();
  if (session?.access_token) {
    store.setSession(session.access_token, session.user?.id ?? null);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      syncStore(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.access_token) {
        syncStore(nextSession);
      } else if (event === 'SIGNED_OUT') {
        useAuthStore.getState().clearAuth();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(() => signInWithProvider('google'), []);

  const sendEmailOtp = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { shouldCreateUser: true },
    });
    if (error) {
      console.error('[sendEmailOtp] Supabase error:', error);
      throw error;
    }
  }, []);

  const resendEmailOtp = useCallback(async (email: string) => {
    // signInWithOtp issues a fresh code, which doubles as "resend".
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
    if (error) {
      console.error('[verifyEmailOtp] Supabase error:', error);
      throw error;
    }
    return data.session;
  }, []);

  const signOut = useCallback(async () => {
    if (useAuthStore.getState().token) {
      try {
        await apiClient.post('/auth/logout');
      } catch {
        /* best-effort: revoking backend tokens must not block local sign-out */
      }
    }
    await supabase.auth.signOut();
    queryClient.clear();
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
