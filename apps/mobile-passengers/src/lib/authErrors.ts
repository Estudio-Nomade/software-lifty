/** Copy when account is Google-only (no password provider). */
export const GOOGLE_ONLY_LOGIN_MESSAGE =
  'Esta cuenta se creó con Google. Tocá Continuar con Google para entrar.';

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

/** Refresh/JWT/session failures — never map to OTP copy. */
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

/**
 * Real OTP / email-code / magic-link verify errors.
 * Excludes refresh/JWT (checked first by callers via isSessionOrRefreshAuthError).
 */
export function isOtpAuthError(error: unknown): boolean {
  const message = errorMessage(error);
  if (!message) return false;
  if (isSessionOrRefreshAuthError(error)) return false;
  if (message.includes('invalid otp') || message.includes('otp')) return true;
  if (message.includes('token has expired or is invalid')) return true;
  // Supabase magic link / email OTP without the word "otp"
  if (
    message.includes('email link') &&
    (message.includes('invalid') || message.includes('expired') || message.includes('expir'))
  ) {
    return true;
  }
  // "Token has expired", "Code expired", "Magic link expired" — not bare "session expired"
  if (
    (message.includes('expired') || message.includes('expir')) &&
    (message.includes('token') ||
      message.includes('code') ||
      message.includes('link') ||
      message.includes('magic'))
  ) {
    return true;
  }
  return false;
}

function isOtpUserFacingCopy(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('codigo') && (t.includes('invalido') || t.includes('expiro') || t.includes('pedi'))
  );
}

/**
 * Password / email-login path only — never returns OTP “código” copy.
 * VerifyEmail / LoginOTP keep using getFriendlyAuthError.
 */
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
    message.includes('timeout')
  ) {
    return 'Sin conexion. Verifica tu internet e intenta de nuevo.';
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

  // Session/refresh/JWT before bare "invalid"/"expired" — never OTP.
  if (isSessionOrRefreshAuthError(error)) {
    return SESSION_AUTH_RETRY_MESSAGE;
  }

  // OTP / magic-link verify path (isOtpAuthError covers classic + expiry phrasings).
  if (isOtpAuthError(error)) {
    if (message.includes('expired') || message.includes('expir')) {
      // "Token has expired or is invalid" → long copy (invalid OR expired).
      if (message.includes('invalid') || message.includes('token has expired or is invalid')) {
        return OTP_INVALID_MESSAGE;
      }
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
    message.includes('timeout')
  ) {
    return 'Sin conexion. Verifica tu internet e intenta de nuevo.';
  }
  if (message.includes('provider') || message.includes('oauth')) {
    return 'No se pudo iniciar sesion con ese proveedor. Intenta de nuevo.';
  }
  if (
    message.includes('password') &&
    (message.includes('at least') ||
      message.includes('characters') ||
      message.includes('weak') ||
      message.includes('short'))
  ) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }

  console.error('[getFriendlyAuthError] Unknown error:', raw, '| original:', error);
  return 'No se pudo completar el inicio de sesion. Intenta de nuevo.';
}
