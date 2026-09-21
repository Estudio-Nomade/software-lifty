import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { segmentForScreen, useAppNavigation } from '../hooks/useAppNavigation';
import {
  AUTH_FLOW_ROUTES,
  PUBLIC_ENTRY_ROUTES,
  isAllowedWithoutSession,
} from '../lib/authRouteGate';
import { hasActiveTrip } from '../lib/isLiveTrip';
import { targetScreenFromStore } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { useTripStore } from '../store/tripStore';

const TRIP_ROUTES = [
  'incoming-request',
  'navigation',
  'waiting-passenger',
  'trip-in-progress',
  'trip-complete',
];

/**
 * Routes that must match backend onboarding `step` / status.
 * Stale browser URL (e.g. /onboarding-step1 after approval) must not stick.
 * Leave profile/earnings/active alone when the driver is already past onboarding.
 */
const STEP_GATED_ROUTES = [
  'onboarding-step1',
  'onboarding-step2',
  'onboarding-vehicle',
  'kyc-verify',
  'kyc-webview',
  'waiting-approval',
  'under-review',
  'dni-scan',
  'selfie',
  'upload-document',
] as const;

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

  /**
   * Authenticated cold open / stale URL:
   * - welcome/public entry → go to step target (home or onboarding)
   * - wrong onboarding screen (Paso 1/3 after approved, etc.) → correct screen
   * Does not yank profile/earnings/trips or in-progress trip flows.
   * Waits until SessionRestore wrote status/step — null/null must not mean Paso 1/3.
   */
  useEffect(() => {
    if (!sessionRestored) return;
    if (needsRedirect) return;
    if (!isAuthenticated) return;
    // Live status not loaded yet → do not guess OnboardingStep1.
    if (onboardingStep == null && driverStatus == null) return;

    const current = segments[0] ?? '';
    if (TRIP_ROUTES.includes(current)) return;
    if ((AUTH_FLOW_ROUTES as readonly string[]).includes(current)) return;

    const onPublicEntry = (PUBLIC_ENTRY_ROUTES as readonly string[]).includes(current);
    const onStepGated = (STEP_GATED_ROUTES as readonly string[]).includes(current);
    if (!onPublicEntry && !onStepGated) return;

    const screen = targetScreenFromStore(onboardingStep, driverStatus);
    // Empty string = rejected/suspended — leave private onboarding, land on welcome.
    if (screen === '') {
      if (onStepGated) router.replace('/');
      return;
    }
    if (segmentForScreen(screen) === current) return;

    replace(screen);
  }, [
    sessionRestored,
    isAuthenticated,
    segments,
    onboardingStep,
    driverStatus,
    replace,
    needsRedirect,
    router,
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
