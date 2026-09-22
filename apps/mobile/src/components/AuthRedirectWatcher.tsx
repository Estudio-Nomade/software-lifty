import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import type { DriverStatus } from '../api/types';
import { useAppNavigation } from '../hooks/useAppNavigation';
import {
  AUTH_FLOW_ROUTES,
  PUBLIC_ENTRY_ROUTES,
  isAllowedWithoutSession,
} from '../lib/authRouteGate';
import { hasActiveTrip } from '../lib/isLiveTrip';
import { STEP_ROUTE, routeForDriverStatus } from '../lib/postAuthRouting';
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

  // After sign-out: leave private screens and land on welcome.
  useEffect(() => {
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
  }, [needsRedirect, resetRedirect, router, segments]);

  /**
   * Product rule: no session → never stay on onboarding/home/private.
   * Deep links, HMR, stale URLs, or persist race must bounce to welcome
   * (CREAR CUENTA / INICIAR SESION), not Paso 1/3.
   */
  useEffect(() => {
    if (!sessionRestored) return;
    if (isAuthenticated) return;
    const current = segments[0] ?? '';
    if (isAllowedWithoutSession(current)) return;
    router.replace('/');
  }, [sessionRestored, isAuthenticated, segments, router]);

  // Authenticated on welcome/public entry → continue onboarding or home.
  useEffect(() => {
    if (!sessionRestored) return;
    if (needsRedirect) return;
    if (!isAuthenticated || !(PUBLIC_ENTRY_ROUTES as readonly string[]).includes(segments[0] ?? ''))
      return;

    const target = onboardingStep ? STEP_ROUTE[onboardingStep] : undefined;
    const fallback = routeForDriverStatus({
      status: driverStatus ?? 'pending',
      step: onboardingStep as DriverStatus['step'],
    });
    const screen = target?.screen || fallback.screen || 'OnboardingStep1';

    replace(screen);
  }, [
    sessionRestored,
    isAuthenticated,
    segments,
    onboardingStep,
    driverStatus,
    replace,
    needsRedirect,
  ]);

  useEffect(() => {
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
  }, [sessionRestored, isAuthenticated, driverStatus, segments, trip, replace]);

  return null;
}
