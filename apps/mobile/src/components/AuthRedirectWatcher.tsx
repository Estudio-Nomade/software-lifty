import { useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  AUTH_FLOW_ROUTES,
  PUBLIC_ENTRY_ROUTES,
  isAllowedWithoutSession,
} from '../lib/authRouteGate';
import { isDriverStatusUnresolved } from '../lib/driverStatusGate';
import { hasActiveTrip } from '../lib/isLiveTrip';
import { handoffScreenFromStore } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { useTripStore } from '../store/tripStore';

const TRIP_ROUTES = [
  'incoming-request',
  'navigation',
  'waiting-passenger',
  'trip-in-progress',
  'trip-complete',
];

export function AuthRedirectWatcher() {
  const needsRedirect = useAuthStore((s) => s.needsRedirect);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onboardingStep = useAuthStore((s) => s.onboardingStep);
  const driverStatus = useAuthStore((s) => s.driverStatus);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  const resetRedirect = useAuthStore((s) => s.resetRedirect);
  const router = useRouter();
  const segments = useSegments();
  const { replace } = useAppNavigation();
  const trip = useTripStore((s) => s.trip);
  // Android Expo Go often mounts effects before the root Stack is ready;
  // replace() then no-ops and Welcome stays on BrandSplash (handoff) forever.
  // iOS is usually ready already — this gate is a no-op when key exists.
  const rootNavState = useRootNavigationState();
  const navReady = rootNavState?.key != null;

  // After sign-out: leave private screens and land on welcome.
  useEffect(() => {
    if (!navReady) return;
    if (needsRedirect) {
      resetRedirect();
      const current = segments[0] ?? '';
      if (
        current !== undefined &&
        !(AUTH_FLOW_ROUTES as readonly string[]).includes(current) &&
        !TRIP_ROUTES.includes(current)
      ) {
        router.replace('/');
      }
    }
  }, [needsRedirect, resetRedirect, router, segments, navReady]);

  /**
   * Product rule: no session → never stay on onboarding/home/private.
   * Deep links, HMR, stale URLs, or persist race must bounce to welcome
   * (CREAR CUENTA / INICIAR SESION), not Paso 1/3.
   * Sign-out (`needsRedirect`) owns its own bounce — skip to avoid double replace.
   */
  useEffect(() => {
    if (!navReady) return;
    if (!sessionRestored) return;
    if (needsRedirect) return;
    if (isAuthenticated) return;
    const current = segments[0] ?? '';
    if (isAllowedWithoutSession(current)) return;
    router.replace('/');
  }, [sessionRestored, isAuthenticated, segments, router, needsRedirect, navReady]);

  // Authenticated on welcome/public entry → continue onboarding or home.
  // Auth without status/step (API/CORS fail after login) → stay; Welcome recovery UI.
  useEffect(() => {
    if (!navReady) return;
    if (!sessionRestored) return;
    if (needsRedirect) return;
    if (!isAuthenticated || !(PUBLIC_ENTRY_ROUTES as readonly string[]).includes(segments[0] ?? ''))
      return;
    if (isDriverStatusUnresolved(isAuthenticated, driverStatus, onboardingStep)) return;

    const screen = handoffScreenFromStore(driverStatus, onboardingStep) || 'OnboardingStep1';
    if (!screen) return;

    console.log('[AuthRedirectWatcher] handoff replace →', screen);
    replace(screen);
  }, [
    sessionRestored,
    isAuthenticated,
    segments,
    onboardingStep,
    driverStatus,
    replace,
    needsRedirect,
    navReady,
  ]);

  useEffect(() => {
    if (!navReady) return;
    if (!sessionRestored) return;
    if (!isAuthenticated || driverStatus !== 'approved') return;
    const current = segments[0] ?? '';
    if (!TRIP_ROUTES.includes(current)) return;
    // Use a status-based check (not the time-based `isLiveTrip`) so this guard
    // never yanks an approved driver off a trip screen mid-transition (e.g.
    // accepting a trip: `setActiveTrip` → `replace('Navigation')`). A trip in
    // any active status is authoritative regardless of its `updated_at` age.
    if (hasActiveTrip(trip)) return;
    replace('Active');
  }, [sessionRestored, isAuthenticated, driverStatus, segments, trip, replace, navReady]);

  return null;
}
