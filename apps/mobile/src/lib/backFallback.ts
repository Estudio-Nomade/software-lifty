/** Route segment (last path part) → ScreenName when stack has no history. */
export const BACK_FALLBACK: Record<string, string> = {
  'onboarding-vehicle': 'OnboardingStep1',
  'onboarding-step2': 'OnboardingVehicle',
  'kyc-verify': 'OnboardingStep1',
  'kyc-webview': 'KYCVerify',
  'waiting-approval': 'OnboardingStep2',
  'select-district': 'SelectProvince',
  'district-terms': 'SelectDistrict',
  support: 'Profile',
  terms: 'Profile',
  messages: 'Profile',
  'delete-account': 'Profile',
  'cancellation-policy': 'Profile',
  'pay-commission-debt': 'Earnings',
  // Tab Viajes is often stack root (TabBar replace) — back must still exit to home.
  'trip-history': 'Active',
};
