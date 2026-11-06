import {
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_AUTH_RETRY_MESSAGE,
  getFriendlyAuthError,
  getFriendlyPasswordLoginError,
} from '../../lib/authErrors';

describe('getFriendlyAuthError', () => {
  it('maps Invalid login credentials to wrong email/password, not OTP', () => {
    expect(getFriendlyAuthError(new Error('Invalid login credentials'))).toBe(
      INVALID_CREDENTIALS_MESSAGE,
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
