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
  TripHistory: '/trip-history',
  OnboardingStep1: '/onboarding-step1',
  OnboardingStep2: '/onboarding-step2',
  OnboardingVehicle: '/onboarding-vehicle',
  UploadDocument: '/upload-document',
  KYCVerify: '/kyc-verify',
  KYCWebView: '/kyc-webview',
  DNIScan: '/dni-scan',
  Selfie: '/selfie',
  UnderReview: '/under-review',
  WaitingApproval: '/waiting-approval',
  Online: '/online',
  Active: '/active',
  IncomingRequest: '/incoming-request',
  Navigation: '/navigation',
  WaitingPassenger: '/waiting-passenger',
  TripInProgress: '/trip-in-progress',
  TripComplete: '/trip-complete',
  Earnings: '/earnings',
  Profile: '/profile',
  PaymentMethod: '/payment-method',
  Withdraw: '/withdraw',
  SelectProvince: '/select-province',
  SelectDistrict: '/select-district',
  DistrictTerms: '/district-terms',
  PassengerCode: '/passenger-code',
} as const;

export type ScreenName = keyof typeof SCREEN_TO_ROUTE;

export interface ScreenParams {
  KYCWebView: { url: string };
  UploadDocument: { docType: string; docLabel: string; mode?: string };
  TripComplete: { amount?: string; commission?: string; driverEarnings?: string };
}

const BACK_FALLBACK: Record<string, string> = {
  'onboarding-vehicle': 'OnboardingStep1',
  'onboarding-step2': 'OnboardingVehicle',
  'kyc-verify': 'OnboardingStep1',
  'kyc-webview': 'KYCVerify',
  'waiting-approval': 'OnboardingStep2',
  'select-district': 'SelectProvince',
  'district-terms': 'SelectDistrict',
};

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
    } else {
      console.log('[nav] goBack blocked: nothing to go back to');
    }
  };

  return {
    navigate: push,
    goBack,
    replace,
  };
}
