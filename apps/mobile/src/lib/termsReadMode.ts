/**
 * Terms CTA mode after login vs profile.
 * Login always sets isAuthenticated before navigating to Terms — never use auth alone.
 * Profile passes from=profile for read-only VOLVER.
 */
export function isTermsReadMode(input: {
  from?: string | string[] | null;
  termsAccepted: boolean;
}): boolean {
  const from = Array.isArray(input.from) ? input.from[0] : input.from;
  if (from === 'profile') return true;
  if (input.termsAccepted) return true;
  return false;
}
