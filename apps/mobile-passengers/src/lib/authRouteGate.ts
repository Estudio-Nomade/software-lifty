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
 * Rutas de las que un user autenticado debe salir → /home.
 * NO incluir dual-use post-login (terms: onboarding + lectura desde Perfil).
 */
export const AUTHED_KICK_TO_HOME_ROUTES = [
  '',
  'register',
  'forgot-password',
  'auth',
  'auth-callback',
  'login-credentials',
  'login-phone',
  'login-otp',
  'verify-email',
  'location-permissions',
] as const;

const AUTHED_KICK_SET = new Set<string>(AUTHED_KICK_TO_HOME_ROUTES);

/** True si un user con sesión no debe quedarse en este segment de ruta. */
export function shouldKickAuthedUserToHome(segment: string): boolean {
  return AUTHED_KICK_SET.has(segment);
}
