/** Copy when account is Google-only (no password provider). */
export const GOOGLE_ONLY_LOGIN_MESSAGE =
  'Esta cuenta se creó con Google. Tocá Continuar con Google para entrar.';

export const INVALID_CREDENTIALS_MESSAGE = 'Email o contraseña incorrectos.';

export function isInvalidLoginCredentialsError(error: unknown): boolean {
  const raw =
    (typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '')) || '';
  const message = raw.toLowerCase();
  return (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    (message.includes('wrong') && message.includes('password')) ||
    message.includes('email or password')
  );
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

  if (message.includes('token has expired or is invalid')) {
    return 'El codigo es invalido o expiro. Pedi uno nuevo.';
  }

  if (message.includes('expired') || message.includes('expir')) {
    return 'El codigo expiro. Pedi uno nuevo.';
  }

  if (message.includes('otp') || message.includes('invalid') || message.includes('incorrect')) {
    return 'El codigo es invalido o expiro. Pedi uno nuevo.';
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
