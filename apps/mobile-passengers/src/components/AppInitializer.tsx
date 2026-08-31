import * as Notifications from 'expo-notifications';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { InteractionManager, Platform } from 'react-native';
import { api } from '../api/client';
import { registerPassenger } from '../api/passenger';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  handleNotificationResponse,
  registerForPush,
  setupNotificationHandler,
} from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { LoadingOverlay } from './feedback/LoadingOverlay';

const PUBLIC_ROUTES = [
  '',
  'register',
  'forgot-password',
  'auth',
  'login-credentials',
  'verify-email',
  'location-permissions',
];

function SessionRestore() {
  const setSession = useAuthStore((s) => s.setSession);
  const setSessionRestored = useAuthStore((s) => s.setSessionRestored);

  useEffect(() => {
    const restore = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        setSessionRestored(true);
        return;
      }
      const metadata = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
      setSession(
        token,
        data.session?.user?.id ?? null,
        data.session?.user?.email ?? null,
        (metadata?.full_name as string) ?? undefined,
      );
      setSessionRestored(true);
    };
    restore();
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
    navigatedRef.current = true;
    InteractionManager.runAfterInteractions(() => {
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
    setupNotificationHandler();

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response, navigate);
    });

    return () => {
      subscription.remove();
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
  const sessionRestored = useAuthStore((s) => s.sessionRestored);

  return (
    <>
      <LoadingOverlay visible={!sessionRestored} />
      <SessionRestore />
      <PassengerProfileRegistrar />
      <AuthRedirectWatcher />
      <ActiveTripRecovery />
      <NotificationSetup />
    </>
  );
}
