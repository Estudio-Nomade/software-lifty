import {
  GOOGLE_ONLY_LOGIN_MESSAGE,
  getFriendlyAuthError,
  isInvalidLoginCredentialsError,
} from '../../lib/authErrors';

describe('getFriendlyAuthError', () => {
  it('maps Invalid login credentials to wrong email/password, not OTP', () => {
    expect(getFriendlyAuthError(new Error('Invalid login credentials'))).toBe(
      'Email o contraseña incorrectos.',
    );
    expect(isInvalidLoginCredentialsError(new Error('Invalid login credentials'))).toBe(true);
  });

  it('exposes Google-only copy constant for hint path', () => {
    expect(GOOGLE_ONLY_LOGIN_MESSAGE).toContain('Google');
    expect(GOOGLE_ONLY_LOGIN_MESSAGE).not.toMatch(/otp|codigo/i);
  });

  it('maps OTP token invalid/expired to OTP copy', () => {
    expect(
      getFriendlyAuthError(new Error('Token has expired or is invalid')),
    ).toBe('El codigo es invalido o expiro. Pedi uno nuevo.');
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

  it('does not map bare phone not confirmed to email copy', () => {
    expect(getFriendlyAuthError(new Error('Phone not confirmed'))).not.toBe(
      'Confirmá tu email antes de iniciar sesión.',
    );
  });
});
