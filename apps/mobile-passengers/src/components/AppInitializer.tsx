import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { api } from '../api/client';
import { getActiveRide, getProfile, registerPassenger } from '../api/passenger';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { shouldKickAuthedUserToHome } from '../lib/authRouteGate';
import {
  addNotificationResponseListener,
  handleNotificationResponse,
  registerForPush,
  setupNotificationHandler,
} from '../lib/notifications';
import {
  invalidatePassengerProfileCompleteCache,
  isPassengerProfileComplete,
  readPassengerProfileCompleteCache,
  writePassengerProfileCompleteCache,
} from '../lib/passengerProfileGate';
import {
  outcomeFromAccessToken,
  shouldApplySessionAfterSettle,
  shouldClearGhostOnRestoreFailure,
} from '../lib/sessionRestorePolicy';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useRideStore } from '../store/rideStore';
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

async function resolvePassengerProfileComplete(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const cached = readPassengerProfileCompleteCache(userId);
  if (cached !== null) return cached;

  try {
    let profile = await getProfile().catch(() => null);
    if (!profile) {
      await registerPassenger().catch(() => null);
      profile = await getProfile().catch(() => null);
    }
    const complete = profile ? isPassengerProfileComplete(profile) : false;
    writePassengerProfileCompleteCache(userId, complete);
    return complete;
  } catch {
    writePassengerProfileCompleteCache(userId, false);
    return false;
  }
}

function SessionRestore() {
  const setSession = useAuthStore((s) => s.setSession);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setSessionRestored = useAuthStore((s) => s.setSessionRestored);

  useEffect(() => {
    let cancelled = false;
    let sessionConfirmed = false;
    let restoreSettled = false;

    const markRestored = () => {
      if (cancelled) return;
      setSessionRestored(true);
    };

    /** First timeout or getSession outcome wins; late continuations no-op. */
    const settle = (fn: () => void) => {
      if (cancelled || restoreSettled) return;
      restoreSettled = true;
      clearTimeout(timeoutId);
      fn();
    };

    const clearGhostAndRestore = () => {
      settle(() => {
        // Drop stale zustand persist so Home is never shown without Supabase session.
        clearAuth();
        markRestored();
      });
    };

    const timeoutId = setTimeout(() => {
      console.log('[SessionRestore] timeout — marking session restored');
      settle(() => {
        if (shouldClearGhostOnRestoreFailure(sessionConfirmed)) {
          clearAuth();
        }
        markRestored();
      });
    }, SESSION_RESTORE_TIMEOUT_MS);

    const restore = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!shouldApplySessionAfterSettle(restoreSettled)) return;
        const token = data.session?.access_token ?? null;
        if (outcomeFromAccessToken(token) === 'clear_ghost') {
          clearGhostAndRestore();
          return;
        }
        settle(() => {
          sessionConfirmed = true;
          const metadata = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
          setSession(
            token,
            data.session?.user?.id ?? null,
            data.session?.user?.email ?? null,
            (metadata?.full_name as string) ?? undefined,
          );
          markRestored();
        });
      } catch (err: unknown) {
        console.log('[SessionRestore] getSession ERROR:', err instanceof Error ? err.message : err);
        if (cancelled) return;
        if (!shouldApplySessionAfterSettle(restoreSettled)) return;
        if (shouldClearGhostOnRestoreFailure(sessionConfirmed)) {
          clearGhostAndRestore();
          return;
        }
        settle(() => markRestored());
      }
    };
    restore();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [setSession, clearAuth, setSessionRestored]);

  return null;
}

function PassengerProfileRegistrar() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fullName = useAuthStore((s) => s.fullName);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || registeredRef.current) return;
    registeredRef.current = true;
    // Minimal row only — phone/name completion happens on CompleteProfile or email path.
    registerPassenger(undefined, fullName ?? undefined).catch(() => {});
  }, [isAuthenticated, fullName]);

  useEffect(() => {
    if (!isAuthenticated) {
      registeredRef.current = false;
      invalidatePassengerProfileCompleteCache();
    }
  }, [isAuthenticated]);

  return null;
}

function AuthRedirectWatcher() {
  const needsRedirect = useAuthStore((s) => s.needsRedirect);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const userId = useAuthStore((s) => s.userId);
  const resetRedirect = useAuthStore((s) => s.resetRedirect);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (needsRedirect) {
      resetRedirect();
      invalidatePassengerProfileCompleteCache();
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
    // OAuth exchange in flight — do not race complete-profile.
    if (current === 'auth-callback') return;

    let cancelled = false;

    void (async () => {
      const complete = await resolvePassengerProfileComplete(userId);
      if (cancelled) return;

      if (!complete) {
        if (current !== 'complete-profile') {
          router.replace('/complete-profile');
        }
        return;
      }

      // complete-profile / location-permissions stay (POST_AUTH_FLOW); screen owns next hop.
      if (shouldKickAuthedUserToHome(current)) {
        router.replace('/home');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionRestored, isAuthenticated, segments, router, userId]);

  return null;
}

/**
 * Recover an in-progress trip after cold start. Does NOT force Home —
 * incomplete-profile gates and AuthRedirectWatcher own post-auth routing.
 */
function ActiveTripRecovery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const userId = useAuthStore((s) => s.userId);
  const setActiveTrip = useRideStore((s) => s.setActiveTrip);
  const router = useRouter();
  const segments = useSegments();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      attemptedRef.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!sessionRestored || !isAuthenticated || attemptedRef.current) return;

    const current = segments[0] ?? '';
    if (current === 'auth-callback' || current === 'complete-profile') return;

    attemptedRef.current = true;
    let cancelled = false;

    runAfterInteractions(() => {
      void (async () => {
        const complete = await resolvePassengerProfileComplete(userId);
        if (cancelled || !complete) return;

        const trip = await getActiveRide().catch(() => null);
        if (cancelled || !trip) return;

        if (trip.status === 'pending' || trip.status === 'offered') {
          router.replace({
            pathname: '/connecting-driver',
            params: { tripId: trip.id },
          });
          return;
        }
        if (['accepted', 'en_route', 'waiting', 'in_trip'].includes(trip.status)) {
          setActiveTrip(trip);
          router.replace('/trip-in-progress');
          return;
        }
        if (trip.status === 'completed') {
          setActiveTrip(trip);
          router.replace('/trip-complete');
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [sessionRestored, isAuthenticated, router, segments, userId, setActiveTrip]);

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
