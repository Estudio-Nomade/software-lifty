/**
 * Maps Supabase / network auth errors to short, friendly Spanish messages.
 * Keep this the single place where raw auth errors become user-facing copy.
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

  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    (message.includes('wrong') && message.includes('password')) ||
    message.includes('email or password')
  ) {
    return 'Email o contraseña incorrectos.';
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
