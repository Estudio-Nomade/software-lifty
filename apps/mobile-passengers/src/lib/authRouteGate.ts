/**
 * Rutas visitables sin sesión (onboarding / auth).
 * Incluye dual-use post-login (p.ej. terms desde Perfil)
 * y post-auth flow (complete-profile / location-permissions).
 */
export const PUBLIC_ROUTES = [
  '',
  'register',
  'forgot-password',
  'auth',
  'auth-callback',
  'login-credentials',
  'login-phone',
  'login-otp',
  'terms',
  'verify-email',
  'location-permissions',
  'complete-profile',
] as const;

/**
 * Public routes an authed user may stay on (read mode / dual-use).
 * Add here when a new PUBLIC route is also valid post-login.
 */
export const DUAL_USE_ROUTES = ['terms'] as const;

/**
 * Post-auth onboarding: authed user stays; screen decides next step.
 * Not dual-use — incomplete users land here; complete users leave via screen/gate.
 */
export const POST_AUTH_FLOW_ROUTES = ['complete-profile', 'location-permissions'] as const;

const DUAL_USE_SET = new Set<string>(DUAL_USE_ROUTES);
const POST_AUTH_FLOW_SET = new Set<string>(POST_AUTH_FLOW_ROUTES);

/**
 * Rutas de las que un user autenticado debe salir → /home.
 * Derived from PUBLIC_ROUTES minus dual-use and post-auth flow so lists cannot drift.
 */
export const AUTHED_KICK_TO_HOME_ROUTES = PUBLIC_ROUTES.filter(
  (route) => !DUAL_USE_SET.has(route) && !POST_AUTH_FLOW_SET.has(route),
);

const AUTHED_KICK_SET = new Set<string>(AUTHED_KICK_TO_HOME_ROUTES);

/** True si un user con sesión no debe quedarse en este segment de ruta. */
export function shouldKickAuthedUserToHome(segment: string): boolean {
  if (POST_AUTH_FLOW_SET.has(segment)) return false;
  return AUTHED_KICK_SET.has(segment);
}

/** True si el segment es onboarding post-auth (no forzar Home). */
export function isPostAuthFlowRoute(segment: string): boolean {
  return POST_AUTH_FLOW_SET.has(segment);
}
