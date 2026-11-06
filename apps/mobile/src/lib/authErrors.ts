/**
 * Maps Supabase / network auth errors to short, friendly Spanish messages.
 * Keep this the single place where raw auth errors become user-facing copy.
 */

export const INVALID_CREDENTIALS_MESSAGE = 'Email o contraseña incorrectos.';
export const SESSION_AUTH_RETRY_MESSAGE = 'No se pudo iniciar sesión. Probá de nuevo.';

const OTP_INVALID_MESSAGE = 'El codigo es invalido o expiro. Pedi uno nuevo.';
const OTP_EXPIRED_MESSAGE = 'El codigo expiro. Pedi uno nuevo.';

function errorMessage(error: unknown): string {
  const raw =
    (typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '')) || '';
  return raw.toLowerCase();
}

export function isInvalidLoginCredentialsError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    (message.includes('wrong') && message.includes('password')) ||
    message.includes('email or password')
  );
}

export function isSessionOrRefreshAuthError(error: unknown): boolean {
  const message = errorMessage(error);
  if (!message) return false;
  if (message.includes('refresh token') || message.includes('refresh_token')) return true;
  if (message.includes('invalid jwt') || message.includes('jwt expired')) return true;
  if (message.includes('jwt') && message.includes('invalid')) return true;
  if (message.includes('auth session missing')) return true;
  if (
    message.includes('session') &&
    (message.includes('missing') || message.includes('not found'))
  ) {
    return true;
  }
  return false;
}

export function isOtpAuthError(error: unknown): boolean {
  const message = errorMessage(error);
  if (!message) return false;
  if (message.includes('invalid otp') || message.includes('otp')) return true;
  if (message.includes('token has expired or is invalid')) return true;
  return false;
}

function isOtpUserFacingCopy(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('codigo') && (t.includes('invalido') || t.includes('expiro') || t.includes('pedi'))
  );
}

/** Password login path — never returns OTP “código” copy. */
export function getFriendlyPasswordLoginError(error: unknown): string {
  const message = errorMessage(error);

  if (!message) return 'Algo salio mal. Intenta de nuevo.';

  if (message.includes('cancel') || message.includes('dismiss')) {
    return 'Inicio de sesion cancelado.';
  }

  if (isInvalidLoginCredentialsError(error)) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  if (
    message.includes('email not confirmed') ||
    (message.includes('confirm') && message.includes('email'))
  ) {
    return 'Confirmá tu email antes de iniciar sesión.';
  }

  if (isSessionOrRefreshAuthError(error) || isOtpAuthError(error)) {
    return SESSION_AUTH_RETRY_MESSAGE;
  }

  if (message.includes('rate') || message.includes('too many') || message.includes('security')) {
    return 'Demasiados intentos. Espera un momento antes de reintentar.';
  }

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('cors') ||
    message.includes('servidor de lifty')
  ) {
    return 'No pudimos hablar con el servidor de Lifty. Revisá conexión o API.';
  }

  if (message.includes('provider') || message.includes('oauth')) {
    return 'No se pudo iniciar sesion con ese proveedor. Intenta de nuevo.';
  }

  const generic = getFriendlyAuthError(error);
  if (isOtpUserFacingCopy(generic)) {
    return SESSION_AUTH_RETRY_MESSAGE;
  }
  return generic;
}

export function getFriendlyAuthError(error: unknown): string {
  const raw =
    (typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '')) || '';
  const message = raw.toLowerCase();

  if (!message) return 'Algo salio mal. Intenta de nuevo.';

  if (message.includes('cancel') || message.includes('dismiss')) {
    return 'Inicio de sesion cancelado.';
  }

  if (isInvalidLoginCredentialsError(error)) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  if (
    message.includes('email not confirmed') ||
    (message.includes('confirm') && message.includes('email'))
  ) {
    return 'Confirmá tu email antes de iniciar sesión.';
  }

  if (isSessionOrRefreshAuthError(error)) {
    return SESSION_AUTH_RETRY_MESSAGE;
  }

  if (message.includes('token has expired or is invalid')) {
    return OTP_INVALID_MESSAGE;
  }

  if (message.includes('otp')) {
    if (message.includes('expired') || message.includes('expir')) {
      return OTP_EXPIRED_MESSAGE;
    }
    return OTP_INVALID_MESSAGE;
  }

  if (message.includes('rate') || message.includes('too many') || message.includes('security')) {
    return 'Demasiados intentos. Espera un momento antes de reintentar.';
  }
  if (message.includes('send') && message.includes('email')) {
    return 'Error al enviar el email. Verifica tu conexion o intenta mas tarde.';
  }
  if (
    message.includes('already') ||
    message.includes('registered') ||
    message.includes('user already') ||
    message.includes('email address has already been registered')
  ) {
    return 'Este email ya esta registrado en Lifty. Inicia sesion en lugar de crear una cuenta nueva.';
  }
  if (message.includes('email') && (message.includes('valid') || message.includes('format'))) {
    return 'Ingresa un email valido.';
  }
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('cors') ||
    message.includes('servidor de lifty')
  ) {
    return 'No pudimos hablar con el servidor de Lifty. Revisá conexión o API.';
  }
  if (message.includes('provider') || message.includes('oauth')) {
    return 'No se pudo iniciar sesion con ese proveedor. Intenta de nuevo.';
  }

  console.error('[getFriendlyAuthError] Unknown error:', raw, '| original:', error);
  return 'No se pudo completar el inicio de sesion. Intenta de nuevo.';
}
