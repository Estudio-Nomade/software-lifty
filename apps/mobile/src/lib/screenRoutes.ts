/**
 * ScreenName → expo-router pathname. Pure map (no expo-router import) so unit
 * tests and AuthCallback can resolve post-auth targets without loading the nav hook.
 */
export const SCREEN_TO_ROUTE = {
  Welcome: '/',
  Auth: '/auth',
  Register: '/register',
  LoginPhone: '/login-phone',
  LoginOTP: '/login-otp',
  LoginCredentials: '/login-credentials',
  AuthCallback: '/auth-callback',
  ForgotPassword: '/forgot-password',
  Terms: '/terms',
  Support: '/support',
  Messages: '/messages',
  TripHistory: '/trip-history',
  PassengerAccountNotice: '/passenger-account-notice',
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
  TripCancelled: '/trip-cancelled',
  TripComplete: '/trip-complete',
  Earnings: '/earnings',
  PayCommissionDebt: '/pay-commission-debt',
  Profile: '/profile',
  CancellationPolicy: '/cancellation-policy',
  PaymentMethod: '/payment-method',
  SelectProvince: '/select-province',
  SelectDistrict: '/select-district',
  DistrictTerms: '/district-terms',
  PassengerCode: '/passenger-code',
  Chat: '/chat',
} as const;

export type ScreenName = keyof typeof SCREEN_TO_ROUTE;

/** Pathname for expo-router replace/push from a ScreenName (or Welcome fallback). */
export function routePathForScreen(screen: ScreenName | '' | string): string {
  if (!screen) return '/';
  return SCREEN_TO_ROUTE[screen as ScreenName] ?? '/';
}
