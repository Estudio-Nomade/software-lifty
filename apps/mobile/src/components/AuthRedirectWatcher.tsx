import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import type { DriverStatus } from '../api/types';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { isLiveTrip } from '../lib/isLiveTrip';
import { STEP_ROUTE, routeForDriverStatus } from '../lib/postAuthRouting';
import { useAuthStore } from '../store/authStore';
import { useTripStore } from '../store/tripStore';

const PUBLIC_ROUTES = ['', 'register', 'forgot-password'];

const AUTH_FLOW_ROUTES = ['login-credentials', 'terms', 'register', 'forgot-password', 'auth'];

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

  useEffect(() => {
    if (needsRedirect) {
      resetRedirect();
      const current = segments[0] ?? '';
      if (
        current !== undefined &&
        !AUTH_FLOW_ROUTES.includes(current) &&
        !TRIP_ROUTES.includes(current)
      ) {
        router.replace('/');
      }
    }
  }, [needsRedirect, resetRedirect, router, segments]);

  useEffect(() => {
    if (!sessionRestored) return;
    if (needsRedirect) return;
    if (!isAuthenticated || !PUBLIC_ROUTES.includes(segments[0] ?? '')) return;

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
    if (isLiveTrip(trip)) return;
    replace('Online');
  }, [sessionRestored, isAuthenticated, driverStatus, segments, trip, replace]);

  return null;
}
