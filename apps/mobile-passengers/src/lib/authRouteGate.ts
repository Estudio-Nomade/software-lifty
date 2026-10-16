/**
 * Routes reachable without a Supabase session.
 * Product: everyone else → welcome (Crear cuenta / Iniciar sesión).
 * ServiceArea + LocationPermissions are post-auth only.
 */

export const PUBLIC_ENTRY_ROUTES = ['', 'register', 'forgot-password'] as const;

export const AUTH_FLOW_ROUTES = [
  'login-credentials',
  'login-phone',
  'login-otp',
  'verify-email',
  'terms',
  'register',
  'forgot-password',
  'auth',
  'auth-callback',
] as const;

export function isAllowedWithoutSession(segment: string): boolean {
  return (
    (PUBLIC_ENTRY_ROUTES as readonly string[]).includes(segment) ||
    (AUTH_FLOW_ROUTES as readonly string[]).includes(segment)
  );
}

/** Post-login public-ish routes still reachable while authenticated (not forced off). */
export const POST_AUTH_ONBOARDING_ROUTES = ['service-area', 'location-permissions'] as const;

export function isPostAuthOnboardingRoute(segment: string): boolean {
  return (POST_AUTH_ONBOARDING_ROUTES as readonly string[]).includes(segment);
}
