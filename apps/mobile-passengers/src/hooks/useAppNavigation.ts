import { useRouter, useSegments } from 'expo-router';

const SCREEN_TO_ROUTE = {
  Welcome: '/',
  Auth: '/auth',
  Register: '/register',
  LoginPhone: '/login-phone',
  LoginOTP: '/login-otp',
  LoginCredentials: '/login-credentials',
  ForgotPassword: '/forgot-password',
  Terms: '/terms',
  Home: '/home',
  TripRequest: '/trip-request',
  TripInProgress: '/trip-in-progress',
  TripComplete: '/trip-complete',
  TripHistory: '/trip-history',
  Profile: '/profile',
  PaymentMethod: '/payment-method',
  Chat: '/chat',
} as const;

export type ScreenName = keyof typeof SCREEN_TO_ROUTE;

const BACK_FALLBACK: Record<string, string> = {};

export function useAppNavigation() {
  const router = useRouter();
  const segments = useSegments();

  const push = (screen: string, params?: Record<string, string>) => {
    const route = SCREEN_TO_ROUTE[screen as ScreenName];
    if (!route) return;
    if (params && Object.keys(params).length > 0) {
      router.push({ pathname: route, params });
    } else {
      router.push(route);
    }
  };

  const replace = (screen: string, params?: Record<string, string>) => {
    const route = SCREEN_TO_ROUTE[screen as ScreenName];
    if (!route) return;
    if (params && Object.keys(params).length > 0) {
      router.replace({ pathname: route, params });
    } else {
      router.replace(route);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    const currentRoute = segments[segments.length - 1] ?? '';
    const fallback = BACK_FALLBACK[currentRoute];
    if (fallback) {
      replace(fallback);
    }
  };

  return {
    navigate: push,
    goBack,
    replace,
  };
}
