import {
  GOOGLE_ONLY_LOGIN_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_AUTH_RETRY_MESSAGE,
  getFriendlyAuthError,
  getFriendlyPasswordLoginError,
  isInvalidLoginCredentialsError,
  isOtpAuthError,
  isSessionOrRefreshAuthError,
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
    expect(getFriendlyAuthError(new Error('Magic link has expired'))).toMatch(/codigo/i);
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
    const msg = getFriendlyAuthError(new Error('Invalid Refresh Token'));
    expect(msg).toBe(SESSION_AUTH_RETRY_MESSAGE);
    expect(msg).not.toMatch(/codigo|otp/i);
    expect(isSessionOrRefreshAuthError(new Error('Invalid Refresh Token'))).toBe(true);
  });

  it('does not map Invalid JWT to OTP copy', () => {
    const msg = getFriendlyAuthError(new Error('Invalid JWT'));
    expect(msg).toBe(SESSION_AUTH_RETRY_MESSAGE);
    expect(msg).not.toMatch(/codigo|otp/i);
  });

  it('does not map bare invalid without credentials/otp to OTP copy', () => {
    const msg = getFriendlyAuthError(new Error('Something invalid happened'));
    expect(msg).not.toMatch(/codigo|pedi uno/i);
  });
});

describe('getFriendlyPasswordLoginError', () => {
  it('maps credentials to email/password copy', () => {
    expect(getFriendlyPasswordLoginError(new Error('Invalid login credentials'))).toBe(
      INVALID_CREDENTIALS_MESSAGE,
    );
  });

  it('never returns OTP code copy for refresh/jwt/otp-shaped errors', () => {
    for (const raw of [
      'Invalid Refresh Token',
      'Refresh Token Not Found',
      'Invalid JWT',
      'jwt expired',
      'Invalid OTP',
      'Token has expired or is invalid',
      'Auth session missing',
    ]) {
      const msg = getFriendlyPasswordLoginError(new Error(raw));
      expect(msg).not.toMatch(/codigo|pedi uno/i);
      expect(isOtpAuthError(new Error(raw)) || isSessionOrRefreshAuthError(new Error(raw))).toBe(
        true,
      );
    }
  });

  it('maps email not confirmed', () => {
    expect(getFriendlyPasswordLoginError(new Error('Email not confirmed'))).toBe(
      'Confirmá tu email antes de iniciar sesión.',
    );
  });
});
