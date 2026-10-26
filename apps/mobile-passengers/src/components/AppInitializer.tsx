import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { api } from '../api/client';
import { registerPassenger } from '../api/passenger';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { shouldKickAuthedUserToHome } from '../lib/authRouteGate';
import {
  addNotificationResponseListener,
  handleNotificationResponse,
  registerForPush,
  setupNotificationHandler,
} from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { PlatformRealtimeProvider } from './PlatformRealtimeProvider';

/**
 * RN 0.88 removed InteractionManager.
 * Prefer next frame + macrotask (not requestIdleCallback — can stall under load).
 */
function runAfterInteractions(task: () => void): void {
  const raf = globalThis.requestAnimationFrame?.bind(globalThis);
  if (typeof raf === 'function') {
    raf(() => {
      setTimeout(task, 0);
    });
    return;
  }
  setTimeout(task, 0);
}

const SESSION_RESTORE_TIMEOUT_MS = 8_000;

function SessionRestore() {
  const setSession = useAuthStore((s) => s.setSession);
  const setSessionRestored = useAuthStore((s) => s.setSessionRestored);

  useEffect(() => {
    let cancelled = false;
    const markRestored = () => {
      if (cancelled) return;
      setSessionRestored(true);
    };
    const timeoutId = setTimeout(() => {
      console.log('[SessionRestore] timeout — marking session restored');
      markRestored();
    }, SESSION_RESTORE_TIMEOUT_MS);

    const restore = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        const token = data.session?.access_token ?? null;
        if (!token) {
          markRestored();
          return;
        }
        const metadata = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
        setSession(
          token,
          data.session?.user?.id ?? null,
          data.session?.user?.email ?? null,
          (metadata?.full_name as string) ?? undefined,
        );
        markRestored();
      } catch (err: unknown) {
        console.log('[SessionRestore] getSession ERROR:', err instanceof Error ? err.message : err);
        markRestored();
      }
    };
    restore();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [setSession, setSessionRestored]);

  return null;
}

function PassengerProfileRegistrar() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fullName = useAuthStore((s) => s.fullName);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || registeredRef.current) return;
    registeredRef.current = true;
    registerPassenger(undefined, fullName ?? undefined).catch(() => {});
  }, [isAuthenticated, fullName]);

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
    if (shouldKickAuthedUserToHome(current)) {
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
    navigatedRef.current = true;
    runAfterInteractions(() => {
      router.replace('/home');
    });
  }, [sessionRestored, isAuthenticated, router]);

  return null;
}

function NotificationSetup() {
  const { navigate } = useAppNavigation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);

  useEffect(() => {
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;

    void (async () => {
      await setupNotificationHandler();
      if (cancelled) return;
      subscription = await addNotificationResponseListener((response) => {
        handleNotificationResponse(response, navigate);
      });
      if (cancelled) {
        subscription?.remove();
        subscription = null;
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [navigate]);

  useEffect(() => {
    if (!sessionRestored || !isAuthenticated) return;

    registerForPush().then((token) => {
      if (!token) return;
      api
        .post('/notifications/token', {
          token,
          platform: Platform.OS,
        })
        .catch(() => {
          // best-effort
        });
    });
  }, [sessionRestored, isAuthenticated]);

  return null;
}

export function AppInitializer() {
  return (
    <>
      <SessionRestore />
      <PassengerProfileRegistrar />
      <AuthRedirectWatcher />
      <ActiveTripRecovery />
      <NotificationSetup />
      <PlatformRealtimeProvider />
    </>
  );
}
