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

function syncStore(session: Session | null) {
  const store = useAuthStore.getState();
  if (session?.access_token) {
    const metadata = session.user?.user_metadata as Record<string, unknown> | undefined;
    store.setSession(
      session.access_token,
      session.user?.id ?? null,
      session.user?.email ?? null,
      (metadata?.full_name as string) ?? undefined,
    );
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
