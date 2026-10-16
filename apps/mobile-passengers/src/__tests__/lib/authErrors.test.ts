import { getFriendlyAuthError } from '../../lib/authErrors';

describe('getFriendlyAuthError', () => {
  it('maps Invalid login credentials to wrong email/password, not OTP', () => {
    expect(getFriendlyAuthError(new Error('Invalid login credentials'))).toBe(
      'Email o contraseña incorrectos.',
    );
  });

  it('maps OTP token invalid/expired to OTP copy', () => {
    expect(getFriendlyAuthError(new Error('Token has expired or is invalid'))).toBe(
      'El codigo es invalido o expiro. Pedi uno nuevo.',
    );
  });

  it('maps generic otp invalid without confusing password login', () => {
    expect(getFriendlyAuthError(new Error('Invalid OTP'))).toBe(
      'El codigo es invalido o expiro. Pedi uno nuevo.',
    );
  });

  it('maps email not confirmed', () => {
    expect(getFriendlyAuthError(new Error('Email not confirmed'))).toBe(
      'Confirmá tu email antes de iniciar sesión.',
    );
  });

  it('does not map bare invalid request to OTP copy', () => {
    expect(getFriendlyAuthError(new Error('invalid request'))).toBe(
      'No se pudo completar el inicio de sesion. Intenta de nuevo.',
    );
  });

  it('maps already registered', () => {
    expect(getFriendlyAuthError(new Error('User already registered'))).toContain('ya esta registrado');
  });

  it('maps network errors', () => {
    expect(getFriendlyAuthError(new Error('Network request failed'))).toContain('conexion');
  });

  it('maps confirmation email send failure without OTP wording', () => {
    expect(getFriendlyAuthError(new Error('Error sending confirmation email'))).toContain(
      'enviar el email',
    );
  });

  it('maps signup disabled', () => {
    expect(getFriendlyAuthError(new Error('Signups not allowed for this instance'))).toContain(
      'deshabilitado',
    );
  });
});
