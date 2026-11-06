import {
  EXISTING_DUAL_ROLE_ACCOUNT_MESSAGE,
  GOOGLE_ONLY_LOGIN_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_AUTH_RETRY_MESSAGE,
  getFriendlyAuthError,
  getFriendlyPasswordLoginError,
  isInvalidLoginCredentialsError,
} from '../../lib/authErrors';

describe('getFriendlyAuthError', () => {
  it('maps Invalid login credentials to wrong email/password, not OTP', () => {
    expect(getFriendlyAuthError(new Error('Invalid login credentials'))).toBe(
      INVALID_CREDENTIALS_MESSAGE,
    );
    expect(isInvalidLoginCredentialsError(new Error('Invalid login credentials'))).toBe(true);
  });

  it('exposes Google-only copy constant for hint path', () => {
    expect(GOOGLE_ONLY_LOGIN_MESSAGE).toContain('Google');
    expect(GOOGLE_ONLY_LOGIN_MESSAGE).not.toMatch(/otp|codigo/i);
  });

  it('exposes dual-role existing-account copy without password-only lie', () => {
    expect(EXISTING_DUAL_ROLE_ACCOUNT_MESSAGE).toMatch(/pasajero|conductor/i);
    expect(EXISTING_DUAL_ROLE_ACCOUNT_MESSAGE).toContain('Google');
    expect(EXISTING_DUAL_ROLE_ACCOUNT_MESSAGE).not.toMatch(/usa el mismo email y contrase[nñ]a/i);
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

  it('maps email link / magic-link expiry to OTP copy', () => {
    expect(getFriendlyAuthError(new Error('Email link is invalid or has expired'))).toMatch(
      /codigo/i,
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

  it('does not map Invalid Refresh Token to OTP copy', () => {
    expect(getFriendlyAuthError(new Error('Invalid Refresh Token'))).toBe(
      SESSION_AUTH_RETRY_MESSAGE,
    );
  });

  it('does not map Invalid JWT to OTP copy', () => {
    expect(getFriendlyAuthError(new Error('Invalid JWT'))).toBe(SESSION_AUTH_RETRY_MESSAGE);
  });
});

describe('getFriendlyPasswordLoginError', () => {
  it('never returns OTP code copy for refresh/jwt/otp-shaped errors', () => {
    for (const raw of [
      'Invalid Refresh Token',
      'Invalid JWT',
      'Invalid OTP',
      'Token has expired or is invalid',
    ]) {
      expect(getFriendlyPasswordLoginError(new Error(raw))).not.toMatch(/codigo|pedi uno/i);
    }
  });
});
