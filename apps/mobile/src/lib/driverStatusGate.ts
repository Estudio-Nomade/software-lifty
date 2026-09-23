export type WelcomeEntryMode = 'loading' | 'guest' | 'recovery' | 'handoff';

/**
 * Authenticated without a resolved driver route (status/step never arrived).
 * Welcome must not spin forever; AuthRedirectWatcher must not invent onboarding.
 */
export function isDriverStatusUnresolved(
  isAuthenticated: boolean,
  driverStatus: string | null,
  onboardingStep: string | null,
): boolean {
  return isAuthenticated && driverStatus == null && onboardingStep == null;
}

export function welcomeEntryMode(input: {
  authLoading: boolean;
  sessionRestored: boolean;
  isAuthenticated: boolean;
  driverStatus: string | null;
  onboardingStep: string | null;
}): WelcomeEntryMode {
  if (input.authLoading || !input.sessionRestored) return 'loading';

  if (!input.isAuthenticated) return 'guest';

  if (isDriverStatusUnresolved(true, input.driverStatus, input.onboardingStep)) {
    return 'recovery';
  }

  return 'handoff';
}
