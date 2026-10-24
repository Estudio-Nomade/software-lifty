export type ExitOnboardingDeps = {
  signOut: () => Promise<void>;
  clearAuthState: () => void;
};

export type ExitOnboardingOptions = {
  inFlight?: boolean;
};

export type ExitOnboardingResult = 'signed_out' | 'cleared_local' | 'skipped';

/**
 * Escape onboarding entry (Paso 1/3) to Welcome guest CTAs.
 * Must sign out — replace('Welcome') alone re-handoffs via AuthRedirectWatcher.
 */
export async function exitOnboardingToWelcome(
  deps: ExitOnboardingDeps,
  options: ExitOnboardingOptions = {},
): Promise<ExitOnboardingResult> {
  if (options.inFlight) return 'skipped';

  try {
    await deps.signOut();
    return 'signed_out';
  } catch {
    deps.clearAuthState();
    return 'cleared_local';
  }
}
