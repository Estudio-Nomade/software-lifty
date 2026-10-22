/**
 * Rutas visitables sin sesión (onboarding / auth).
 * Incluye dual-use post-login (p.ej. terms desde Perfil).
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
] as const;

/**
 * Public routes an authed user may stay on (read mode / dual-use).
 * Add here when a new PUBLIC route is also valid post-login.
 */
export const DUAL_USE_ROUTES = ['terms'] as const;

const DUAL_USE_SET = new Set<string>(DUAL_USE_ROUTES);

/**
 * Rutas de las que un user autenticado debe salir → /home.
 * Derived from PUBLIC_ROUTES minus dual-use so lists cannot drift.
 */
export const AUTHED_KICK_TO_HOME_ROUTES = PUBLIC_ROUTES.filter((route) => !DUAL_USE_SET.has(route));

const AUTHED_KICK_SET = new Set<string>(AUTHED_KICK_TO_HOME_ROUTES);

/** True si un user con sesión no debe quedarse en este segment de ruta. */
export function shouldKickAuthedUserToHome(segment: string): boolean {
  return AUTHED_KICK_SET.has(segment);
}
