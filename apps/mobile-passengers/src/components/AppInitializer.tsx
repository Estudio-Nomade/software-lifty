import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { LoadingOverlay } from './feedback/LoadingOverlay';

const PUBLIC_ROUTES = ['', 'register', 'forgot-password', 'auth', 'terms', 'login-credentials'];

function SessionRestore() {
  const setSession = useAuthStore((s) => s.setSession);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setSessionRestored = useAuthStore((s) => s.setSessionRestored);

  useEffect(() => {
    const restore = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        clearAuth();
        setSessionRestored(true);
        return;
      }
      setSession(token, data.session?.user?.id ?? null, data.session?.user?.email ?? null);
      setSessionRestored(true);
    };
    restore();
  }, [setSession, clearAuth, setSessionRestored]);

  return null;
}

function AuthRedirectWatcher() {
  const needsRedirect = useAuthStore((s) => s.needsRedirect);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const resetRedirect = useAuthStore((s) => s.resetRedirect);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (needsRedirect) {
      resetRedirect();
      const current = segments[0] ?? '';
      if (current !== '' && current !== 'home') {
        router.replace('/');
      }
    }
  }, [needsRedirect, resetRedirect, router, segments]);

  useEffect(() => {
    if (!sessionRestored) return;
    if (!isAuthenticated) return;

    const current = segments[0] ?? '';
    if (PUBLIC_ROUTES.includes(current) || current === '') {
      router.replace('/home');
    }
  }, [sessionRestored, isAuthenticated, segments, router]);

  return null;
}

function ActiveTripRecovery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const router = useRouter();
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!sessionRestored || !isAuthenticated || navigatedRef.current) return;
    InteractionManager.runAfterInteractions(() => {
      router.replace('/home');
    });
  }, [sessionRestored, isAuthenticated, router]);

  return null;
}

export function AppInitializer() {
  const sessionRestored = useAuthStore((s) => s.sessionRestored);

  if (!sessionRestored) {
    return <LoadingOverlay visible />;
  }

  return (
    <>
      <SessionRestore />
      <AuthRedirectWatcher />
      <ActiveTripRecovery />
    </>
  );
}
