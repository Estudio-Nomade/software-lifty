/**
 * Maps Supabase / network auth errors to short, friendly Spanish messages.
 * OTP copy only when the raw error is about tokens/codes — never for login/signup.
 */
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

  if (message.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos.';
  }

  if (message.includes('email not confirmed')) {
    return 'Confirmá tu email antes de iniciar sesión.';
  }

  if (
    message.includes('already') ||
    message.includes('registered') ||
    message.includes('user already') ||
    message.includes('email address has already been registered')
  ) {
    return 'Este email ya esta registrado en Lifty. Inicia sesion en lugar de crear una cuenta nueva.';
  }

  if (
    message.includes('email') &&
    (message.includes('valid') || message.includes('format') || message.includes('invalid'))
  ) {
    return 'Ingresa un email valido.';
  }

  // Exact Supabase OTP string first (contains both expired + invalid).
  if (message.includes('token has expired or is invalid')) {
    return 'El codigo es invalido o expiro. Pedi uno nuevo.';
  }

  // OTP / magic-link token only — not bare "invalid" (login, OAuth, request).
  const isOtpish =
    message.includes('otp') ||
    message.includes('token') ||
    message.includes('verification code') ||
    (message.includes('code') &&
      (message.includes('invalid') ||
        message.includes('expired') ||
        message.includes('incorrect')));

  if (isOtpish && (message.includes('invalid') || message.includes('incorrect'))) {
    return 'El codigo es invalido o expiro. Pedi uno nuevo.';
  }
  if (isOtpish && (message.includes('expired') || message.includes('expir'))) {
    return 'El codigo expiro. Pedi uno nuevo.';
  }

  if (message.includes('rate') || message.includes('too many') || message.includes('security')) {
    return 'Demasiados intentos. Espera un momento antes de reintentar.';
  }
  if (
    (message.includes('send') && message.includes('email')) ||
    message.includes('error sending confirmation') ||
    message.includes('error sending magic link')
  ) {
    return 'Error al enviar el email. Verifica tu conexion o intenta mas tarde.';
  }
  if (message.includes('signup') && message.includes('disabled')) {
    return 'El registro esta temporalmente deshabilitado. Intenta mas tarde.';
  }
  if (message.includes('signups not allowed') || message.includes('signup is disabled')) {
    return 'El registro esta temporalmente deshabilitado. Intenta mas tarde.';
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
  if (message.includes('password')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }

  console.error('[getFriendlyAuthError] Unknown error:', raw, '| original:', error);
  return 'No se pudo completar el inicio de sesion. Intenta de nuevo.';
}
