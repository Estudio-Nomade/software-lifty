/**
 * Routes reachable without a Supabase session.
 * Product: everyone else → welcome (CREAR CUENTA / INICIAR SESION).
 */

/** Welcome + bare public entry. */
export const PUBLIC_ENTRY_ROUTES = ['', 'register', 'forgot-password'] as const;

/** Auth / pre-auth flows that must stay reachable without a session. */
export const AUTH_FLOW_ROUTES = [
  'login-credentials',
  'login-phone',
  'login-otp',
  'terms',
  'register',
  'forgot-password',
  'auth',
] as const;

export function isAllowedWithoutSession(segment: string): boolean {
  return (
    (PUBLIC_ENTRY_ROUTES as readonly string[]).includes(segment) ||
    (AUTH_FLOW_ROUTES as readonly string[]).includes(segment)
  );
}
