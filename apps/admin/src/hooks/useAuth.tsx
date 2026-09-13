import { apiFetch } from '@/lib/api';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
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

type AuthMe = {
  id: string;
  role: string;
  email?: string | null;
  phone?: string | null;
};

type AuthContextValue = {
  initialized: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ user: User | null }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchIsAdmin(): Promise<boolean> {
  try {
    const me = await apiFetch<AuthMe>('/auth/me');
    return me.role === 'admin';
  } catch {
    try {
      await apiFetch('/admin/drivers/pending');
      return true;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 403) return false;
      if (status === 401) return false;
      return false;
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const refreshRole = useCallback(async () => {
    const ok = await fetchIsAdmin();
    setIsAdmin(ok);
    return ok;
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        const ok = await fetchIsAdmin();
        if (mounted) setIsAdmin(ok);
      }
      if (mounted) setInitialized(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setIsAdmin(false);
      } else {
        void fetchIsAdmin().then((ok) => {
          if (mounted) setIsAdmin(ok);
        });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase no está configurado. Revisá .env (VITE_SUPABASE_*).');
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { user: data.user };
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
  }, []);

  const value = useMemo(
    () => ({
      initialized,
      loading,
      session,
      user: session?.user ?? null,
      isAdmin,
      signIn,
      signOut,
      refreshRole,
    }),
    [initialized, loading, session, isAdmin, signIn, signOut, refreshRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
