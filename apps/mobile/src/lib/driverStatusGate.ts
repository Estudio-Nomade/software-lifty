export type WelcomeEntryMode = 'loading' | 'guest' | 'recovery' | 'handoff';

/** Max time Welcome may show BrandSplash in handoff waiting for a replace. */
export const HANDOFF_TIMEOUT_MS = 4_000;

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
  /** When true, handoff waited too long without leaving Welcome → recovery UI. */
  handoffTimedOut?: boolean;
}): WelcomeEntryMode {
  if (input.authLoading || !input.sessionRestored) return 'loading';

  if (!input.isAuthenticated) return 'guest';

  if (isDriverStatusUnresolved(true, input.driverStatus, input.onboardingStep)) {
    return 'recovery';
  }

  // Authenticated + known status but still on Welcome after timeout → don't
  // spin BrandSplash forever (watcher replace can no-op on Android).
  if (input.handoffTimedOut) return 'recovery';

  return 'handoff';
}
