import { useRouter, useSegments } from 'expo-router';
import { useCallback } from 'react';

const SCREEN_TO_ROUTE = {
  Welcome: '/',
  Auth: '/auth',
  Register: '/register',
  LoginPhone: '/login-phone',
  LoginOTP: '/login-otp',
  LoginCredentials: '/login-credentials',
  ForgotPassword: '/forgot-password',
  VerifyEmail: '/verify-email',
  Terms: '/terms',
  Home: '/home',
  LocationPermissions: '/location-permissions',
  TripRequest: '/trip-request',
  VehicleSelect: '/vehicle-select',
  TripInProgress: '/trip-in-progress',
  ConnectingDriver: '/connecting-driver',
  TripComplete: '/trip-complete',
  TripHistory: '/trip-history',
  Profile: '/profile',
  PaymentMethod: '/payment-method',
  Support: '/support',
  Chat: '/chat',
  Notifications: '/notifications',
} as const;

export type ScreenName = keyof typeof SCREEN_TO_ROUTE;

const BACK_FALLBACK: Record<string, string> = {
  terms: 'Profile',
  support: 'Profile',
};

export function useAppNavigation() {
  const router = useRouter();
  const segments = useSegments();

  const push = useCallback(
    (screen: string, params?: Record<string, string>) => {
      const route = SCREEN_TO_ROUTE[screen as ScreenName];
      if (!route) return;
      if (params && Object.keys(params).length > 0) {
        router.push({ pathname: route, params });
      } else {
        router.push(route);
      }
    },
    [router],
  );

  const replace = useCallback(
    (screen: string, params?: Record<string, string>) => {
      const route = SCREEN_TO_ROUTE[screen as ScreenName];
      if (!route) return;
      if (params && Object.keys(params).length > 0) {
        router.replace({ pathname: route, params });
      } else {
        router.replace(route);
      }
    },
    [router],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    const currentRoute = segments[segments.length - 1] ?? '';
    const fallback = BACK_FALLBACK[currentRoute];
    if (fallback) {
      replace(fallback);
    }
  }, [router, segments, replace]);

  return {
    navigate: push,
    goBack,
    replace,
  };
}
