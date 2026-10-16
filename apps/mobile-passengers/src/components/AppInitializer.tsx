import * as Notifications from 'expo-notifications';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { InteractionManager, Platform } from 'react-native';
import { api } from '../api/client';
import { getProfile, registerPassenger } from '../api/passenger';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { isAllowedWithoutSession, isPostAuthOnboardingRoute } from '../lib/authRouteGate';
import {
  handleNotificationResponse,
  registerForPush,
  setupNotificationHandler,
} from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useRegistrationDraftStore } from '../store/registrationDraftStore';

const PUBLIC_ENTRY_ROUTES = [
  '',
  'register',
  'forgot-password',
  'auth',
  'login-credentials',
  'verify-email',
];

/** First-run coverage notice before Home (Villa Dolores launch). Auth only. */
function postAuthLandingScreen(): 'ServiceArea' | 'Home' {
  return useAuthStore.getState().coverageNoticeSeen ? 'Home' : 'ServiceArea';
}

/** Drop fake auth from persist when Supabase has no live token (no logout redirect spam). */
function clearStaleAuthWithoutRedirect() {
  const s = useAuthStore.getState();
  if (!s.isAuthenticated && !s.token) return;
  useAuthStore.setState({
    token: null,
    userId: null,
    email: null,
    fullName: null,
    isAuthenticated: false,
    needsRedirect: false,
  });
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
          // Never keep persist isAuthenticated without a live session → no ServiceArea flash.
          clearStaleAuthWithoutRedirect();
          markRestored();
          return;
        }
        // Token/ids only here; fullName comes from draft/register + profile SoT (users.full_name).
        setSession(token, data.session?.user?.id ?? null, data.session?.user?.email ?? null);
        markRestored();
      } catch (err: unknown) {
        console.log('[SessionRestore] getSession ERROR:', err instanceof Error ? err.message : err);
        clearStaleAuthWithoutRedirect();
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
  const setFullName = useAuthStore((s) => s.setFullName);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || registeredRef.current) return;
    registeredRef.current = true;

    const draftName = useRegistrationDraftStore.getState().fullName?.trim() || null;
    const storeName = useAuthStore.getState().fullName?.trim() || null;
    // Prefer Lifty draft typed before Google over OAuth nickname metadata.
    const nameForRegister = draftName || storeName || undefined;

    registerPassenger(undefined, nameForRegister)
      .then((profile) => {
        if (profile.full_name) setFullName(profile.full_name);
        if (draftName) useRegistrationDraftStore.getState().clear();
      })
      .catch(() => {
        // Profile may already exist — still hydrate name from DB SoT.
        getProfile()
          .then((profile) => {
            if (profile.full_name) setFullName(profile.full_name);
          })
          .catch(() => {});
      });
  }, [isAuthenticated, setFullName]);

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

  // No session → never stay on ServiceArea / Home / private routes.
  useEffect(() => {
    if (!sessionRestored) return;
    if (isAuthenticated) return;

    const current = segments[0] ?? '';
    if (!isAllowedWithoutSession(current)) {
      router.replace('/');
    }
  }, [sessionRestored, isAuthenticated, segments, router]);

  // Live session on welcome/auth entry → ServiceArea (once) or Home.
  useEffect(() => {
    if (!sessionRestored) return;
    if (!isAuthenticated) return;

    const current = segments[0] ?? '';
    // Stay on coverage / GPS onboarding until the user finishes those steps.
    if (isPostAuthOnboardingRoute(current)) return;
    if (PUBLIC_ENTRY_ROUTES.includes(current) || current === '') {
      const landing = postAuthLandingScreen();
      router.replace(landing === 'ServiceArea' ? '/service-area' : '/home');
    }
  }, [sessionRestored, isAuthenticated, segments, router]);

  return null;
}

/**
 * Cold-open recovery for authenticated users only.
 * Does not run for guests — Welcome must win when there is no session.
 */
function ActiveTripRecovery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const coverageNoticeSeen = useAuthStore((s) => s.coverageNoticeSeen);
  const router = useRouter();
  const segments = useSegments();
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!sessionRestored || !isAuthenticated || navigatedRef.current) return;
    const current = segments[0] ?? '';
    // Never yank the user off coverage / GPS steps mid-flow.
    if (isPostAuthOnboardingRoute(current)) return;
    // Only reclaim from welcome/auth entry or empty stack — not mid-trip screens.
    if (!(PUBLIC_ENTRY_ROUTES.includes(current) || current === '')) return;
    navigatedRef.current = true;
    InteractionManager.runAfterInteractions(() => {
      // Re-check: session may have been cleared while we waited.
      if (!useAuthStore.getState().isAuthenticated) return;
      if (!useAuthStore.getState().coverageNoticeSeen) {
        router.replace('/service-area');
        return;
      }
      router.replace('/home');
    });
  }, [sessionRestored, isAuthenticated, coverageNoticeSeen, segments, router]);

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
  return (
    <>
      <SessionRestore />
      <PassengerProfileRegistrar />
      <AuthRedirectWatcher />
      <ActiveTripRecovery />
      <NotificationSetup />
    </>
  );
}
