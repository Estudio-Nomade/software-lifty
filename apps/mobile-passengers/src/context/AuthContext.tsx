import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { type ReactNode, useEffect } from 'react';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const setSession = useAuthStore((s) => s.setSession);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [setSession, setLoading]);

  return children;
}
